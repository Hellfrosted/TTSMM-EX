import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { hydrateSessionMods, type AppConfig } from 'model';
import type { ModDataOverride } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import api from 'renderer/Api';
import type { AuthoritativeCollectionState } from 'renderer/authoritative-collection-state';
import type { BlockLookupBuildRequest, BlockLookupIndexStats, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { createCollectionContentSaveRequest } from 'shared/collection-content-save';
import type { CollectionContentSaveResult } from 'shared/collection-content-save';
import type { CollectionLifecycleResult } from 'shared/collection-lifecycle';

type BlockLookupBootstrapQueryData = readonly [BlockLookupSettings, BlockLookupIndexStats | null];

const MOD_METADATA_STARTUP_SCAN_STALE_TIME_MS = Number.POSITIVE_INFINITY;

export const queryKeys = {
	config: {
		root: () => ['config'] as const,
		current: () => [...queryKeys.config.root(), 'current'] as const
	},
	collections: {
		root: () => ['collections'] as const,
		list: () => [...queryKeys.collections.root(), 'list'] as const,
		detail: (collectionName: string) => [...queryKeys.collections.root(), 'detail', collectionName] as const
	},
	mods: {
		root: () => ['mods'] as const,
		metadataRoot: () => [...queryKeys.mods.root(), 'metadata'] as const,
		metadataScan: (
			localDir: string | undefined,
			knownModIds: readonly string[],
			forceReload: boolean,
			attempt: number,
			treatNuterraSteamBetaAsEquivalent: boolean,
			userOverridesKey: readonly unknown[]
		) =>
			[
				...queryKeys.mods.metadataRoot(),
				localDir ?? null,
				knownModIds,
				forceReload,
				attempt,
				treatNuterraSteamBetaAsEquivalent,
				userOverridesKey
			] as const
	},
	game: {
		root: () => ['game'] as const,
		running: (requestId: number) => [...queryKeys.game.root(), 'running', requestId] as const
	},
	blockLookup: {
		root: () => ['blockLookup'] as const,
		bootstrap: () => [...queryKeys.blockLookup.root(), 'bootstrap'] as const,
		searchRoot: () => [...queryKeys.blockLookup.root(), 'search'] as const,
		search: (query: string, limit: number | undefined) => [...queryKeys.blockLookup.searchRoot(), query, limit] as const
	}
};

export function configQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.config.current(),
		queryFn: () => api.readConfig()
	});
}

export function setConfigQueryData(queryClient: QueryClient, config: AppConfig | null) {
	queryClient.setQueryData(queryKeys.config.current(), config);
}

export async function writeConfigMutationFn(nextConfig: AppConfig) {
	const persistedConfig = await api.updateConfig(nextConfig);
	if (!persistedConfig) {
		throw new Error('Config write was rejected');
	}
	return persistedConfig;
}

export function useWriteConfigMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: writeConfigMutationFn,
		onSuccess: (nextConfig) => {
			setConfigQueryData(queryClient, nextConfig);
		}
	});
}

export function collectionsListQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.collections.list(),
		queryFn: async () => (await api.readCollectionsList()) || []
	});
}

export function collectionQueryOptions(collectionName: string) {
	return queryOptions({
		queryKey: queryKeys.collections.detail(collectionName),
		queryFn: () => api.readCollection(collectionName)
	});
}

interface ModMetadataQueryOptionsInput {
	localDir: string | undefined;
	knownMods: Iterable<string>;
	forceReload: boolean;
	attempt: number;
	userOverrides: Map<string, ModDataOverride>;
	treatNuterraSteamBetaAsEquivalent: boolean;
}

function getUserOverridesQueryKey(userOverrides: Map<string, ModDataOverride>) {
	return [...userOverrides.entries()]
		.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
		.map(([uid, override]) => [uid, override.id ?? null, override.tags ? [...override.tags].sort() : []]);
}

export function modMetadataQueryOptions({
	localDir,
	knownMods,
	forceReload,
	attempt,
	userOverrides,
	treatNuterraSteamBetaAsEquivalent
}: ModMetadataQueryOptionsInput) {
	const knownModIds = [...knownMods].sort();
	const userOverridesKey = getUserOverridesQueryKey(userOverrides);
	const dependencyGraphOptions = {
		treatNuterraSteamBetaAsEquivalent
	};

	return queryOptions({
		queryKey: queryKeys.mods.metadataScan(localDir, knownModIds, forceReload, attempt, treatNuterraSteamBetaAsEquivalent, userOverridesKey),
		queryFn: () =>
			api
				.readModMetadata(localDir, new Set(knownModIds), dependencyGraphOptions)
				.then((mods) => hydrateSessionMods(mods, userOverrides, dependencyGraphOptions)),
		staleTime: forceReload ? 0 : MOD_METADATA_STARTUP_SCAN_STALE_TIME_MS
	});
}

export function gameRunningQueryOptions(requestId: number) {
	return queryOptions({
		queryKey: queryKeys.game.running(requestId),
		queryFn: () => api.gameRunning(),
		staleTime: 0
	});
}

export function blockLookupBootstrapQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.blockLookup.bootstrap(),
		queryFn: () => Promise.all([api.readBlockLookupSettings(), api.getBlockLookupStats()]) as Promise<BlockLookupBootstrapQueryData>
	});
}

export function blockLookupSearchQueryOptions(request: BlockLookupSearchRequest) {
	return queryOptions({
		queryKey: queryKeys.blockLookup.search(request.query, request.limit),
		queryFn: () => api.searchBlockLookup(request)
	});
}

export function fetchBlockLookupBootstrap(queryClient: QueryClient) {
	return queryClient.fetchQuery(blockLookupBootstrapQueryOptions());
}

export function fetchBlockLookupSearch(queryClient: QueryClient, request: BlockLookupSearchRequest) {
	return queryClient.fetchQuery(blockLookupSearchQueryOptions(request));
}

async function buildBlockLookupIndexMutationFn(request: BlockLookupBuildRequest) {
	return api.buildBlockLookupIndex(request);
}

export function useBuildBlockLookupIndexMutation() {
	return useMutation({
		mutationFn: buildBlockLookupIndexMutationFn
	});
}

function setCollectionQueryData(queryClient: QueryClient, collection: ModCollection) {
	queryClient.setQueryData(queryKeys.collections.detail(collection.name), collection);
}

function getCachedCollectionDetailNames(queryClient: QueryClient) {
	return queryClient
		.getQueryCache()
		.findAll({ queryKey: queryKeys.collections.root() })
		.flatMap((query) => {
			const queryKey = query.queryKey;
			if (queryKey[0] === 'collections' && queryKey[1] === 'detail' && typeof queryKey[2] === 'string') {
				return [queryKey[2]];
			}
			return [];
		});
}

async function updateCollectionMutationFn(collection: ModCollection): Promise<CollectionContentSaveResult> {
	return api.updateCollection(createCollectionContentSaveRequest(collection));
}

export function useUpdateCollectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: updateCollectionMutationFn,
		onSuccess: (result) => {
			if (result.ok) {
				setCollectionQueryData(queryClient, result.collection);
			}
		}
	});
}

export function applyAuthoritativeCollectionStateToCache(queryClient: QueryClient, result: AuthoritativeCollectionState) {
	const nextCollectionNames = new Set(result.collectionNames);
	const currentCollectionNames = queryClient.getQueryData<string[]>(queryKeys.collections.list()) ?? [];
	const cachedDetailNames = getCachedCollectionDetailNames(queryClient);

	setConfigQueryData(queryClient, result.config);
	queryClient.setQueryData(queryKeys.collections.list(), result.collectionNames);
	result.collections.forEach((collection) => {
		setCollectionQueryData(queryClient, collection);
	});

	new Set([...currentCollectionNames, ...cachedDetailNames]).forEach((collectionName) => {
		if (!nextCollectionNames.has(collectionName)) {
			queryClient.removeQueries({
				queryKey: queryKeys.collections.detail(collectionName),
				exact: true
			});
		}
	});
}

export function applyCollectionLifecycleResultToCache(queryClient: QueryClient, result: Extract<CollectionLifecycleResult, { ok: true }>) {
	applyAuthoritativeCollectionStateToCache(queryClient, result);
}

export function setBlockLookupBootstrapQueryData(queryClient: QueryClient, data: BlockLookupBootstrapQueryData) {
	queryClient.setQueryData(queryKeys.blockLookup.bootstrap(), data);
}

export function invalidateBlockLookupSearchQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: queryKeys.blockLookup.searchRoot() });
}

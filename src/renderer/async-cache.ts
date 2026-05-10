import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import { hydrateSessionMods, type AppConfig } from 'model';
import { createModManagerUid, type ModDataOverride } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import type { AuthoritativeCollectionState } from 'renderer/authoritative-collection-state';
import type { BlockLookupBuildRequest, BlockLookupIndexStats, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { createCollectionContentSaveRequest } from 'shared/collection-content-save';
import type { CollectionContentSaveResult } from 'shared/collection-content-save';
import type { CollectionLifecycleResult } from 'shared/collection-lifecycle';
import { RendererElectron, runRenderer } from './runtime';

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
		queryFn: () => runRenderer(readConfigEffect())
	});
}

export function setConfigQueryData(queryClient: QueryClient, config: AppConfig | null) {
	queryClient.setQueryData(queryKeys.config.current(), config);
}

const readConfigEffect = Effect.fnUntraced(function* (): Effect.fn.Return<AppConfig | null, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.readConfig(),
		catch: (error) => error
	});
});

export const writeConfigEffect = Effect.fnUntraced(function* (
	nextConfig: AppConfig
): Effect.fn.Return<AppConfig, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const persistedConfig = yield* Effect.tryPromise({
		try: () => renderer.electron.updateConfig(nextConfig),
		catch: (error) => error
	});
	if (!persistedConfig) {
		return yield* Effect.fail(new Error('Config write was rejected'));
	}
	return persistedConfig;
});

function writeConfigMutationFn(nextConfig: AppConfig) {
	return runRenderer(writeConfigEffect(nextConfig));
}

export function useWriteConfigMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: writeConfigMutationFn,
		onSuccess: (nextConfig) => {
			queryClient.setQueryData(queryKeys.config.current(), nextConfig);
		}
	});
}

export function collectionsListQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.collections.list(),
		queryFn: () => runRenderer(readCollectionsListEffect())
	});
}

const readCollectionsListEffect = Effect.fnUntraced(function* (): Effect.fn.Return<string[], unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const collections = yield* Effect.tryPromise({
		try: () => renderer.electron.readCollectionsList(),
		catch: (error) => error
	});
	return collections || [];
});

export function collectionQueryOptions(collectionName: string) {
	return queryOptions({
		queryKey: queryKeys.collections.detail(collectionName),
		queryFn: () => runRenderer(readCollectionEffect(collectionName))
	});
}

const readCollectionEffect = Effect.fnUntraced(function* (
	collectionName: string
): Effect.fn.Return<ModCollection | null, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.readCollection(collectionName),
		catch: (error) => error
	});
});

interface ModMetadataQueryOptionsInput {
	localDir: string | undefined;
	scanRequest: ModMetadataScanRequest;
	forceReload: boolean;
	attempt: number;
	userOverrides: Map<string, ModDataOverride>;
	treatNuterraSteamBetaAsEquivalent: boolean;
}

interface ModMetadataScanRequestInput {
	allCollections: Map<string, ModCollection>;
	workshopID: AppConfig['workshopID'];
	forceReload: boolean;
	userOverrides: Map<string, ModDataOverride>;
}

export interface ModMetadataScanRequest {
	knownModIds: readonly string[];
	userOverridesKey: readonly unknown[];
	metadataScanKey: string;
}

function getKnownModIds(allCollections: Map<string, ModCollection>, workshopID: AppConfig['workshopID'], forceReload: boolean) {
	const knownMods = forceReload
		? new Set<string>()
		: new Set([...allCollections.values()].map((value: ModCollection) => value.mods).flat());
	knownMods.add(createModManagerUid(workshopID));
	return Array.from(knownMods).sort();
}

function getUserOverridesQueryKey(userOverrides: Map<string, ModDataOverride>) {
	return Array.from(userOverrides.entries())
		.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
		.map(([uid, override]) => [uid, override.id ?? null, override.tags ? Array.from(override.tags).sort() : []]);
}

export function createModMetadataScanRequest({
	allCollections,
	workshopID,
	forceReload,
	userOverrides
}: ModMetadataScanRequestInput): ModMetadataScanRequest {
	const knownModIds = getKnownModIds(allCollections, workshopID, forceReload);
	const userOverridesKey = getUserOverridesQueryKey(userOverrides);

	return {
		knownModIds,
		userOverridesKey,
		metadataScanKey: `${knownModIds.join('\n')}\u0000${JSON.stringify(userOverridesKey)}`
	};
}

export function modMetadataQueryOptions({
	localDir,
	scanRequest,
	forceReload,
	attempt,
	userOverrides,
	treatNuterraSteamBetaAsEquivalent
}: ModMetadataQueryOptionsInput) {
	const dependencyGraphOptions = {
		treatNuterraSteamBetaAsEquivalent
	};

	return queryOptions({
		queryKey: queryKeys.mods.metadataScan(
			localDir,
			scanRequest.knownModIds,
			forceReload,
			attempt,
			treatNuterraSteamBetaAsEquivalent,
			scanRequest.userOverridesKey
		),
		queryFn: () => runRenderer(readModMetadataEffect(localDir, scanRequest.knownModIds, userOverrides, dependencyGraphOptions)),
		staleTime: forceReload ? 0 : MOD_METADATA_STARTUP_SCAN_STALE_TIME_MS
	});
}

const readModMetadataEffect = Effect.fnUntraced(function* (
	localDir: string | undefined,
	knownModIds: readonly string[],
	userOverrides: Map<string, ModDataOverride>,
	dependencyGraphOptions: { treatNuterraSteamBetaAsEquivalent: boolean }
): Effect.fn.Return<ReturnType<typeof hydrateSessionMods>, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const mods = yield* Effect.tryPromise({
		try: () => renderer.electron.readModMetadata(localDir, [...knownModIds], dependencyGraphOptions),
		catch: (error) => error
	});
	return hydrateSessionMods(mods, userOverrides, dependencyGraphOptions);
});

export function gameRunningQueryOptions(requestId: number) {
	return queryOptions({
		queryKey: queryKeys.game.running(requestId),
		queryFn: () => runRenderer(gameRunningEffect()),
		staleTime: 0
	});
}

const gameRunningEffect = Effect.fnUntraced(function* (): Effect.fn.Return<boolean, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.isGameRunning(),
		catch: (error) => error
	});
});

export function blockLookupBootstrapQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.blockLookup.bootstrap(),
		queryFn: () => runRenderer(readBlockLookupBootstrapEffect())
	});
}

const readBlockLookupBootstrapEffect = Effect.fnUntraced(function* (): Effect.fn.Return<
	BlockLookupBootstrapQueryData,
	unknown,
	RendererElectron
> {
	const renderer = yield* RendererElectron;
	const [settings, stats] = yield* Effect.all(
		[
			Effect.tryPromise({
				try: () => renderer.electron.readBlockLookupSettings(),
				catch: (error) => error
			}),
			Effect.tryPromise({
				try: () => renderer.electron.getBlockLookupStats(),
				catch: (error) => error
			})
		],
		{ concurrency: 2 }
	);
	return [settings, stats] as const;
});

export function blockLookupSearchQueryOptions(request: BlockLookupSearchRequest) {
	return queryOptions({
		queryKey: queryKeys.blockLookup.search(request.query, request.limit),
		queryFn: () => runRenderer(searchBlockLookupEffect(request))
	});
}

const searchBlockLookupEffect = Effect.fnUntraced(function* (
	request: BlockLookupSearchRequest
): Effect.fn.Return<Awaited<ReturnType<typeof window.electron.searchBlockLookup>>, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.searchBlockLookup(request),
		catch: (error) => error
	});
});

export function fetchBlockLookupBootstrap(queryClient: QueryClient) {
	return queryClient.fetchQuery(blockLookupBootstrapQueryOptions());
}

export function fetchBlockLookupSearch(queryClient: QueryClient, request: BlockLookupSearchRequest) {
	return queryClient.fetchQuery(blockLookupSearchQueryOptions(request));
}

const buildBlockLookupIndexEffect = Effect.fnUntraced(function* (request: BlockLookupBuildRequest) {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.buildBlockLookupIndex(request),
		catch: (error) => error
	});
});

function buildBlockLookupIndexMutationFn(request: BlockLookupBuildRequest) {
	return runRenderer(buildBlockLookupIndexEffect(request));
}

export function useBuildBlockLookupIndexMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: buildBlockLookupIndexMutationFn,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.blockLookup.root() });
		}
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

const updateCollectionEffect = Effect.fnUntraced(function* (
	collection: ModCollection
): Effect.fn.Return<CollectionContentSaveResult, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.updateCollection(createCollectionContentSaveRequest(collection)),
		catch: (error) => error
	});
});

function updateCollectionMutationFn(collection: ModCollection): Promise<CollectionContentSaveResult> {
	return runRenderer(updateCollectionEffect(collection));
}

export function useUpdateCollectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: updateCollectionMutationFn,
		onSuccess: (result) => {
			if (result.ok) {
				queryClient.setQueryData(queryKeys.collections.detail(result.collection.name), result.collection);
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

import { useAtomRef } from '@effect/atom-react';
import { useCallback, useState } from 'react';
import { Effect } from 'effect';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
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
type BlockLookupSearchCacheData = Awaited<ReturnType<typeof window.electron.searchBlockLookup>>;
type ModMetadataCacheData = ReturnType<typeof hydrateSessionMods>;

const configCacheRef = AtomRef.make<AppConfig | null | undefined>(undefined);
interface CollectionCacheState {
	collectionNames: string[] | undefined;
	collections: Map<string, ModCollection | null>;
}

const collectionCacheRef = AtomRef.make<CollectionCacheState>({
	collectionNames: undefined,
	collections: new Map()
});
const modMetadataCacheRef = AtomRef.make<Map<string, ModMetadataCacheData>>(new Map());
const gameRunningCacheRef = AtomRef.make<boolean | undefined>(undefined);
const blockLookupBootstrapCacheRef = AtomRef.make<BlockLookupBootstrapQueryData | undefined>(undefined);
const blockLookupSearchCacheRef = AtomRef.make<Map<string, BlockLookupSearchCacheData>>(new Map());

function useCacheMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, onSuccess?: (result: TResult) => void) {
	const [isPending, setIsPending] = useState(false);
	const mutateAsync = useCallback(
		async (input: TInput) => {
			setIsPending(true);
			try {
				const result = await mutationFn(input);
				onSuccess?.(result);
				return result;
			} finally {
				setIsPending(false);
			}
		},
		[mutationFn, onSuccess]
	);
	return { isPending, mutateAsync };
}

export function setConfigCacheData(config: AppConfig | null | undefined) {
	configCacheRef.set(config);
}

export function useConfigCacheValue() {
	return useAtomRef(configCacheRef);
}

export async function readConfigCache(): Promise<AppConfig | null> {
	const cachedConfig = configCacheRef.value;
	if (cachedConfig !== undefined) {
		return cachedConfig;
	}
	const config = await runRenderer(readConfigEffect());
	configCacheRef.set(config);
	return config;
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
	return useCacheMutation(writeConfigMutationFn, (nextConfig) => {
		setConfigCacheData(nextConfig);
	});
}

export function setCollectionCacheData(state: CollectionCacheState) {
	collectionCacheRef.set({
		collectionNames: state.collectionNames,
		collections: new Map(state.collections)
	});
}

export function useCollectionsListCacheValue() {
	return useAtomRef(collectionCacheRef).collectionNames;
}

export function useCollectionCacheValue(collectionName: string) {
	return useAtomRef(collectionCacheRef).collections.get(collectionName);
}

function updateCollectionCache(update: (state: CollectionCacheState) => CollectionCacheState) {
	setCollectionCacheData(update(collectionCacheRef.value));
}

export async function readCollectionsListCache(): Promise<string[]> {
	const cachedCollectionNames = collectionCacheRef.value.collectionNames;
	if (cachedCollectionNames !== undefined) {
		return cachedCollectionNames;
	}
	const collectionNames = await runRenderer(readCollectionsListEffect());
	updateCollectionCache((state) => ({
		...state,
		collectionNames
	}));
	return collectionNames;
}

const readCollectionsListEffect = Effect.fnUntraced(function* (): Effect.fn.Return<string[], unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const collections = yield* Effect.tryPromise({
		try: () => renderer.electron.readCollectionsList(),
		catch: (error) => error
	});
	return collections || [];
});

export async function readCollectionCache(collectionName: string): Promise<ModCollection | null> {
	if (collectionCacheRef.value.collections.has(collectionName)) {
		return collectionCacheRef.value.collections.get(collectionName) ?? null;
	}
	const collection = await runRenderer(readCollectionEffect(collectionName));
	updateCollectionCache((state) => ({
		...state,
		collections: new Map(state.collections).set(collectionName, collection)
	}));
	return collection;
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

export function setModMetadataCacheData(cache: Map<string, ModMetadataCacheData>) {
	modMetadataCacheRef.set(new Map(cache));
}

function getModMetadataCacheKey({ localDir, scanRequest, attempt, treatNuterraSteamBetaAsEquivalent }: ModMetadataQueryOptionsInput) {
	return JSON.stringify([
		localDir ?? null,
		scanRequest.knownModIds,
		attempt,
		treatNuterraSteamBetaAsEquivalent,
		scanRequest.userOverridesKey
	]);
}

export async function readModMetadataCache(input: ModMetadataQueryOptionsInput): Promise<ModMetadataCacheData> {
	const dependencyGraphOptions = {
		treatNuterraSteamBetaAsEquivalent: input.treatNuterraSteamBetaAsEquivalent
	};
	const cacheKey = getModMetadataCacheKey(input);
	if (!input.forceReload) {
		const cachedMods = modMetadataCacheRef.value.get(cacheKey);
		if (cachedMods) {
			return cachedMods;
		}
	}
	const mods = await runRenderer(
		readModMetadataEffect(input.localDir, input.scanRequest.knownModIds, input.userOverrides, dependencyGraphOptions)
	);
	modMetadataCacheRef.set(new Map(modMetadataCacheRef.value).set(cacheKey, mods));
	return mods;
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

export function setGameRunningCacheData(running: boolean | undefined) {
	gameRunningCacheRef.set(running);
}

export async function readGameRunningCache({ forceReload = false }: { forceReload?: boolean } = {}): Promise<boolean> {
	if (!forceReload && gameRunningCacheRef.value !== undefined) {
		return gameRunningCacheRef.value;
	}
	const running = await runRenderer(gameRunningEffect());
	gameRunningCacheRef.set(running);
	return running;
}

const gameRunningEffect = Effect.fnUntraced(function* (): Effect.fn.Return<boolean, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.isGameRunning(),
		catch: (error) => error
	});
});

export function getBlockLookupBootstrapCacheData() {
	return blockLookupBootstrapCacheRef.value;
}

export function setBlockLookupBootstrapCacheData(data: BlockLookupBootstrapQueryData | undefined) {
	blockLookupBootstrapCacheRef.set(data);
}

export function setBlockLookupSearchCacheData(data: Map<string, BlockLookupSearchCacheData>) {
	blockLookupSearchCacheRef.set(new Map(data));
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

function getBlockLookupSearchCacheKey(request: BlockLookupSearchRequest) {
	return JSON.stringify([request.query, request.limit ?? null]);
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

export async function fetchBlockLookupBootstrap() {
	if (blockLookupBootstrapCacheRef.value !== undefined) {
		return blockLookupBootstrapCacheRef.value;
	}
	const data = await runRenderer(readBlockLookupBootstrapEffect());
	blockLookupBootstrapCacheRef.set(data);
	return data;
}

export async function fetchBlockLookupSearch(request: BlockLookupSearchRequest) {
	const cacheKey = getBlockLookupSearchCacheKey(request);
	const cachedResult = blockLookupSearchCacheRef.value.get(cacheKey);
	if (cachedResult) {
		return cachedResult;
	}
	const result = await runRenderer(searchBlockLookupEffect(request));
	blockLookupSearchCacheRef.set(new Map(blockLookupSearchCacheRef.value).set(cacheKey, result));
	return result;
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
	return useCacheMutation(buildBlockLookupIndexMutationFn, () => {
		setBlockLookupBootstrapCacheData(undefined);
		setBlockLookupSearchCacheData(new Map());
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
	return useCacheMutation(updateCollectionMutationFn, (result) => {
		if (result.ok) {
			updateCollectionCache((state) => ({
				...state,
				collections: new Map(state.collections).set(result.collection.name, result.collection)
			}));
		}
	});
}

export function applyAuthoritativeCollectionStateToCache(result: AuthoritativeCollectionState) {
	setConfigCacheData(result.config);
	setCollectionCacheData({
		collectionNames: result.collectionNames,
		collections: new Map(result.collections.map((collection) => [collection.name, collection]))
	});
}

export function applyCollectionLifecycleResultToCache(result: Extract<CollectionLifecycleResult, { ok: true }>) {
	applyAuthoritativeCollectionStateToCache(result);
}

export function setBlockLookupBootstrapQueryData(data: BlockLookupBootstrapQueryData) {
	setBlockLookupBootstrapCacheData(data);
}

export function invalidateBlockLookupSearchQueries() {
	setBlockLookupSearchCacheData(new Map());
	return Promise.resolve();
}

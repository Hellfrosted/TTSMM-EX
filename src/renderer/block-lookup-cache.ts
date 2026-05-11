import { Effect } from 'effect';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { BlockLookupBuildRequest, BlockLookupIndexStats, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { useCacheMutation } from './cache-mutation';
import { RendererElectron, runRenderer } from './runtime';

type BlockLookupBootstrapQueryData = readonly [BlockLookupSettings, BlockLookupIndexStats | null];
type BlockLookupSearchCacheData = Awaited<ReturnType<typeof window.electron.searchBlockLookup>>;

const blockLookupBootstrapCacheRef = AtomRef.make<BlockLookupBootstrapQueryData | undefined>(undefined);
const blockLookupSearchCacheRef = AtomRef.make<Map<string, BlockLookupSearchCacheData>>(new Map());

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

export function setBlockLookupBootstrapQueryData(data: BlockLookupBootstrapQueryData) {
	setBlockLookupBootstrapCacheData(data);
}

export function invalidateBlockLookupSearchQueries() {
	setBlockLookupSearchCacheData(new Map());
	return Promise.resolve();
}

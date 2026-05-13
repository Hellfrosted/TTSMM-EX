import { Effect, Semaphore } from 'effect';
import type {
	BlockLookupBuildRequest,
	BlockLookupBuildResult,
	BlockLookupIndexProgressCallback,
	BlockLookupIndexStats,
	BlockLookupSearchRequest,
	BlockLookupSearchResult,
	BlockLookupSettings
} from 'shared/block-lookup';
import {
	buildBlockLookupIndex,
	getBlockLookupStats,
	readBlockLookupIndex,
	readBlockLookupSettings,
	writeBlockLookupSettings
} from './block-lookup';
import { createWarmBlockLookupSearchIndex, searchWarmBlockLookupRecords, type WarmBlockLookupSearchIndex } from './block-lookup-search';
import { autoDetectBlockLookupWorkshopRootEffect } from './block-lookup-source-discovery';

interface BlockLookupIndexerAdapters {
	buildBlockLookupIndex?: typeof buildBlockLookupIndex;
	readBlockLookupIndex?: typeof readBlockLookupIndex;
}

export interface BlockLookupIndexModule {
	autoDetectWorkshopRoot(request: BlockLookupBuildRequest): string | null;
	autoDetectWorkshopRootEffect(request: BlockLookupBuildRequest): Effect.Effect<string | null>;
	buildIndex(
		request: BlockLookupBuildRequest,
		onProgress?: BlockLookupIndexProgressCallback
	): Effect.Effect<BlockLookupBuildResult, unknown>;
	getStats(): BlockLookupIndexStats | null;
	readSettings(): BlockLookupSettings;
	saveSettings(settings: BlockLookupSettings): BlockLookupSettings;
	search(request: BlockLookupSearchRequest): BlockLookupSearchResult;
}

export function createBlockLookupIndexModule(userDataPath: string, adapters: BlockLookupIndexerAdapters = {}): BlockLookupIndexModule {
	const buildIndexImpl = adapters.buildBlockLookupIndex ?? buildBlockLookupIndex;
	const readIndexImpl = adapters.readBlockLookupIndex ?? readBlockLookupIndex;
	const buildSemaphore = Semaphore.makeUnsafe(1);
	let warmSearchIndex: WarmBlockLookupSearchIndex | null | undefined;
	const getWarmSearchIndex = () => {
		if (warmSearchIndex === undefined) {
			warmSearchIndex = createWarmBlockLookupSearchIndex(readIndexImpl(userDataPath));
		}

		return warmSearchIndex;
	};

	return {
		autoDetectWorkshopRoot(request: BlockLookupBuildRequest) {
			return Effect.runSync(autoDetectBlockLookupWorkshopRootEffect(request));
		},
		autoDetectWorkshopRootEffect(request: BlockLookupBuildRequest) {
			return autoDetectBlockLookupWorkshopRootEffect(request);
		},
		buildIndex(request: BlockLookupBuildRequest, onProgress?: BlockLookupIndexProgressCallback) {
			return buildSemaphore.withPermits(1)(
				buildIndexImpl(userDataPath, request, onProgress).pipe(
					Effect.map((result) => {
						warmSearchIndex = undefined;
						return result;
					})
				)
			);
		},
		getStats() {
			return getWarmSearchIndex()?.stats ?? getBlockLookupStats(userDataPath);
		},
		readSettings() {
			return readBlockLookupSettings(userDataPath);
		},
		saveSettings(settings: BlockLookupSettings) {
			return writeBlockLookupSettings(userDataPath, settings);
		},
		search(request: BlockLookupSearchRequest) {
			return searchWarmBlockLookupRecords(getWarmSearchIndex(), request.query, request.limit);
		}
	};
}

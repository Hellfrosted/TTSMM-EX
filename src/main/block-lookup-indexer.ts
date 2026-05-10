import type {
	BlockLookupBuildRequest,
	BlockLookupBuildResult,
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
import { autoDetectBlockLookupWorkshopRoot } from './block-lookup-source-discovery';

interface BlockLookupIndexerAdapters {
	buildBlockLookupIndex?: typeof buildBlockLookupIndex;
	readBlockLookupIndex?: typeof readBlockLookupIndex;
}

export interface BlockLookupIndexModule {
	autoDetectWorkshopRoot(request: BlockLookupBuildRequest): string | null;
	buildIndex(request: BlockLookupBuildRequest): Promise<BlockLookupBuildResult>;
	getStats(): BlockLookupIndexStats | null;
	readSettings(): BlockLookupSettings;
	saveSettings(settings: BlockLookupSettings): BlockLookupSettings;
	search(request: BlockLookupSearchRequest): BlockLookupSearchResult;
}

export function createBlockLookupIndexModule(userDataPath: string, adapters: BlockLookupIndexerAdapters = {}): BlockLookupIndexModule {
	const buildIndexImpl = adapters.buildBlockLookupIndex ?? buildBlockLookupIndex;
	const readIndexImpl = adapters.readBlockLookupIndex ?? readBlockLookupIndex;
	let warmSearchIndex: WarmBlockLookupSearchIndex | null | undefined;
	const getWarmSearchIndex = () => {
		if (warmSearchIndex === undefined) {
			warmSearchIndex = createWarmBlockLookupSearchIndex(readIndexImpl(userDataPath));
		}

		return warmSearchIndex;
	};

	return {
		autoDetectWorkshopRoot(request: BlockLookupBuildRequest) {
			return autoDetectBlockLookupWorkshopRoot(request);
		},
		async buildIndex(request: BlockLookupBuildRequest) {
			const result = await buildIndexImpl(userDataPath, request);
			warmSearchIndex = undefined;
			return result;
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

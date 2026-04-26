import type { BlockLookupBuildRequest, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import {
	buildBlockLookupIndex,
	getBlockLookupStats,
	readBlockLookupSettings,
	searchBlockLookupIndex,
	writeBlockLookupSettings
} from './block-lookup';
import { autoDetectBlockLookupWorkshopRoot } from './block-lookup-source-discovery';

export function createBlockLookupIndexer(userDataPath: string) {
	return {
		autoDetectWorkshopRoot(request: BlockLookupBuildRequest) {
			return autoDetectBlockLookupWorkshopRoot(request);
		},
		buildIndex(request: BlockLookupBuildRequest) {
			return buildBlockLookupIndex(userDataPath, request);
		},
		getStats() {
			return getBlockLookupStats(userDataPath);
		},
		readSettings() {
			return readBlockLookupSettings(userDataPath);
		},
		saveSettings(settings: BlockLookupSettings) {
			return writeBlockLookupSettings(userDataPath, settings);
		},
		search(request: BlockLookupSearchRequest) {
			return searchBlockLookupIndex(userDataPath, request.query, request.limit);
		}
	};
}

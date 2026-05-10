export const BLOCK_LOOKUP_INDEX_VERSION = 2;
export const BLOCK_LOOKUP_SEARCH_RESULT_LIMIT = 1000;
export { TERRATECH_STEAM_APP_ID } from './terratech';

export type BlockLookupSourceKind = 'vanilla' | 'json' | 'bundle';

export interface BlockLookupPreviewBounds {
	x: number;
	y: number;
	z: number;
}

export interface BlockLookupModSource {
	uid: string;
	id?: string;
	name?: string;
	path?: string;
	workshopID?: string;
}

export interface BlockLookupRecord {
	blockName: string;
	internalName: string;
	blockId: string;
	modTitle: string;
	workshopId: string;
	sourceKind: BlockLookupSourceKind;
	sourcePath: string;
	previewBounds?: BlockLookupPreviewBounds;
	preferredAlias: string;
	fallbackAlias: string;
	spawnCommand: string;
	fallbackSpawnCommand: string;
}

export interface BlockLookupIndexSource {
	sourcePath: string;
	workshopId: string;
	modTitle: string;
	sourceKind: BlockLookupSourceKind;
	size: number;
	mtimeMs: number;
}

export interface BlockLookupIndexStats {
	sources: number;
	scanned: number;
	skipped: number;
	removed: number;
	blocks: number;
	updatedBlocks: number;
	builtAt?: string;
}

export interface BlockLookupSettings {
	workshopRoot: string;
}

export interface BlockLookupBuildRequest {
	workshopRoot?: string;
	gameExec?: string;
	modSources?: BlockLookupModSource[];
	forceRebuild?: boolean;
}

export interface BlockLookupSearchRequest {
	query: string;
	limit?: number;
}

export interface BlockLookupSearchResult {
	rows: BlockLookupRecord[];
	stats: BlockLookupIndexStats | null;
}

export interface BlockLookupBuildResult {
	stats: BlockLookupIndexStats;
}

export interface PersistedBlockLookupIndex {
	version: typeof BLOCK_LOOKUP_INDEX_VERSION;
	builtAt: string;
	sources: BlockLookupIndexSource[];
	records: BlockLookupRecord[];
	sourceRecords?: BlockLookupRecord[];
}

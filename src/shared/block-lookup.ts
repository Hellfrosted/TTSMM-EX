export const BLOCK_LOOKUP_INDEX_VERSION = 1;
export const TERRATECH_STEAM_APP_ID = '285920';

export type BlockLookupSourceKind = 'vanilla' | 'json' | 'bundle';

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
	settings: BlockLookupSettings;
	stats: BlockLookupIndexStats;
}

export interface PersistedBlockLookupIndex {
	version: typeof BLOCK_LOOKUP_INDEX_VERSION;
	builtAt: string;
	sources: BlockLookupIndexSource[];
	records: BlockLookupRecord[];
}

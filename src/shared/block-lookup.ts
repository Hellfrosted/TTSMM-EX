export const BLOCK_LOOKUP_INDEX_VERSION = 7;
export const BLOCK_LOOKUP_SEARCH_RESULT_LIMIT = 1000;
export { TERRATECH_STEAM_APP_ID } from './terratech';

export type BlockLookupSourceKind = 'vanilla' | 'json' | 'bundle';

export interface BlockLookupPreviewBounds {
	x: number;
	y: number;
	z: number;
}

export interface BlockLookupPersistedRenderedPreview {
	cacheRelativePath: string;
	width?: number;
	height?: number;
}

export interface BlockLookupRenderedPreview {
	imageUrl: string;
	width?: number;
	height?: number;
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
	previewAssetNames?: string[];
	renderedPreview?: BlockLookupPersistedRenderedPreview;
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
	renderedPreviewsEnabled: boolean;
	renderedPreviews: number;
	unavailablePreviews: number;
	builtAt?: string;
}

export interface BlockLookupSettings {
	workshopRoot: string;
	renderedPreviewsEnabled: boolean;
}

export interface BlockLookupBuildRequest {
	workshopRoot?: string;
	gameExec?: string;
	modSources?: BlockLookupModSource[];
	forceRebuild?: boolean;
	renderedPreviewsEnabled?: boolean;
}

export type BlockLookupIndexProgressPhase =
	| 'planning'
	| 'scanning-sources'
	| 'indexing-sources'
	| 'extracting-rendered-previews'
	| 'finalizing'
	| 'writing-index'
	| 'complete';

export interface BlockLookupIndexProgress {
	phase: BlockLookupIndexProgressPhase;
	phaseLabel: string;
	countUnit?: string;
	completed: number;
	total: number;
	percent: number;
}

export type BlockLookupIndexProgressCallback = (progress: BlockLookupIndexProgress) => void;

export interface BlockLookupSearchRequest {
	query: string;
	limit?: number;
}

export interface BlockLookupSearchRow extends Omit<BlockLookupRecord, 'renderedPreview'> {
	renderedPreview?: BlockLookupRenderedPreview;
}

export interface BlockLookupSearchResult {
	rows: BlockLookupSearchRow[];
	stats: BlockLookupIndexStats | null;
}

export interface BlockLookupBuildResult {
	stats: BlockLookupIndexStats;
}

export interface PersistedBlockLookupIndex {
	version: typeof BLOCK_LOOKUP_INDEX_VERSION;
	builtAt: string;
	renderedPreviewsEnabled: boolean;
	sources: BlockLookupIndexSource[];
	records: BlockLookupRecord[];
	sourceRecords?: BlockLookupRecord[];
}

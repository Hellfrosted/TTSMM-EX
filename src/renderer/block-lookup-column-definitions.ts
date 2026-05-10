import { BLOCK_LOOKUP_COLUMN_TITLES, BlockLookupColumnTitles, type BlockLookupColumnKey } from 'model';

export interface BlockLookupColumnConfig {
	key: BlockLookupColumnKey;
	title: BlockLookupColumnTitles;
	visible: boolean;
	width?: number;
	defaultWidth: number;
	minWidth: number;
}

export const DEFAULT_BLOCK_LOOKUP_COLUMNS: BlockLookupColumnConfig[] = [
	{ key: 'blockName', title: BLOCK_LOOKUP_COLUMN_TITLES.blockName, visible: true, defaultWidth: 200, minWidth: 96 },
	{ key: 'spawnCommand', title: BLOCK_LOOKUP_COLUMN_TITLES.spawnCommand, visible: true, defaultWidth: 320, minWidth: 140 },
	{ key: 'internalName', title: BLOCK_LOOKUP_COLUMN_TITLES.internalName, visible: true, defaultWidth: 220, minWidth: 136 },
	{ key: 'modTitle', title: BLOCK_LOOKUP_COLUMN_TITLES.modTitle, visible: true, defaultWidth: 176, minWidth: 96 },
	{ key: 'preview', title: BLOCK_LOOKUP_COLUMN_TITLES.preview, visible: true, defaultWidth: 92, minWidth: 76 }
];

export function cloneBlockLookupColumnConfig(columns: BlockLookupColumnConfig[]) {
	return columns.map((column) => ({ ...column }));
}

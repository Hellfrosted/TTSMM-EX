import { BLOCK_LOOKUP_COLUMN_KEYS, BLOCK_LOOKUP_COLUMN_TITLES, BlockLookupColumnTitles, type BlockLookupColumnKey } from 'model';

export interface BlockLookupColumnConfig {
	key: BlockLookupColumnKey;
	title: BlockLookupColumnTitles;
	visible: boolean;
	width?: number;
	defaultWidth: number;
	minWidth: number;
}

const BLOCK_LOOKUP_COLUMN_DEFAULTS = {
	preview: { defaultWidth: 92, minWidth: 76 },
	blockName: { defaultWidth: 200, minWidth: 96 },
	spawnCommand: { defaultWidth: 320, minWidth: 140 },
	internalName: { defaultWidth: 220, minWidth: 136 },
	modTitle: { defaultWidth: 176, minWidth: 96 }
} satisfies Record<BlockLookupColumnKey, Pick<BlockLookupColumnConfig, 'defaultWidth' | 'minWidth'>>;

export const DEFAULT_BLOCK_LOOKUP_COLUMNS: BlockLookupColumnConfig[] = BLOCK_LOOKUP_COLUMN_KEYS.map((key) => ({
	key,
	title: BLOCK_LOOKUP_COLUMN_TITLES[key],
	visible: true,
	...BLOCK_LOOKUP_COLUMN_DEFAULTS[key]
}));

export function cloneBlockLookupColumnConfig(columns: BlockLookupColumnConfig[]) {
	return columns.map((column) => ({ ...column }));
}

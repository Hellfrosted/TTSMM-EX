import { BLOCK_LOOKUP_COLUMN_KEYS, BLOCK_LOOKUP_COLUMN_TITLES, BlockLookupColumnTitles, type BlockLookupColumnKey } from 'model';
import { getDefaultBlockLookupColumnWidth, getMinBlockLookupColumnWidth } from 'shared/block-lookup-view-config';

export interface BlockLookupColumnConfig {
	key: BlockLookupColumnKey;
	title: BlockLookupColumnTitles;
	visible: boolean;
	width?: number;
	defaultWidth: number;
	minWidth: number;
}

export const DEFAULT_BLOCK_LOOKUP_COLUMNS: BlockLookupColumnConfig[] = BLOCK_LOOKUP_COLUMN_KEYS.map((key) => ({
	key,
	title: BLOCK_LOOKUP_COLUMN_TITLES[key],
	visible: true,
	defaultWidth: getDefaultBlockLookupColumnWidth(key),
	minWidth: getMinBlockLookupColumnWidth(key)
}));

export function cloneBlockLookupColumnConfig(columns: BlockLookupColumnConfig[]) {
	return columns.map((column) => ({ ...column }));
}

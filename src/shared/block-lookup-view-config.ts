import { BLOCK_LOOKUP_COLUMN_KEYS, type BlockLookupViewConfig } from 'model/BlockLookupView';
import { isFiniteNumber, normalizeTableViewConfig } from './view-config';

const BLOCK_LOOKUP_COLUMN_WIDTHS = {
	preview: { defaultWidth: 92, minWidth: 76 },
	blockName: { defaultWidth: 200, minWidth: 96 },
	spawnCommand: { defaultWidth: 320, minWidth: 140 },
	internalName: { defaultWidth: 220, minWidth: 136 },
	modTitle: { defaultWidth: 176, minWidth: 96 }
} satisfies Record<(typeof BLOCK_LOOKUP_COLUMN_KEYS)[number], { defaultWidth: number; minWidth: number }>;

export function getDefaultBlockLookupColumnWidth(columnKey: (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number]) {
	return BLOCK_LOOKUP_COLUMN_WIDTHS[columnKey].defaultWidth;
}

export function getMinBlockLookupColumnWidth(columnKey: (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number]) {
	return BLOCK_LOOKUP_COLUMN_WIDTHS[columnKey].minWidth;
}

function clampBlockLookupColumnWidth(columnKey: (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number], width: number) {
	return Math.max(getMinBlockLookupColumnWidth(columnKey), Math.round(width));
}

export function normalizeBlockLookupColumnWidth(columnKey: (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number], width: unknown) {
	if (!isFiniteNumber(width)) {
		return undefined;
	}

	return clampBlockLookupColumnWidth(columnKey, width);
}

export function normalizeBlockLookupViewConfig(config?: BlockLookupViewConfig | Record<string, unknown>): BlockLookupViewConfig {
	return normalizeTableViewConfig(config, BLOCK_LOOKUP_COLUMN_KEYS, {
		normalizeWidth: clampBlockLookupColumnWidth,
		defaultWidth: getDefaultBlockLookupColumnWidth
	});
}

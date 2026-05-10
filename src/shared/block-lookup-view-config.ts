import { BLOCK_LOOKUP_COLUMN_KEYS, type BlockLookupViewConfig } from 'model/BlockLookupView';
import { compactConfiguredOrder, compactRecord, defaultEquivalentOrder, isFiniteNumber } from './view-config';

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

export function normalizeBlockLookupColumnWidth(columnKey: (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number], width: unknown) {
	if (!isFiniteNumber(width)) {
		return undefined;
	}

	return Math.max(getMinBlockLookupColumnWidth(columnKey), Math.round(width));
}

function normalizeBlockLookupColumnWidthConfig(config: unknown) {
	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		return undefined;
	}

	const columnKeySet = new Set<string>(BLOCK_LOOKUP_COLUMN_KEYS);
	const columnWidthConfig = Object.entries(config).reduce<Record<string, number>>((nextConfig, [key, value]) => {
		if (!columnKeySet.has(key)) {
			return nextConfig;
		}

		const columnKey = key as (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number];
		const width = normalizeBlockLookupColumnWidth(columnKey, value);
		if (width !== undefined && width !== getDefaultBlockLookupColumnWidth(columnKey)) {
			nextConfig[key] = width;
		}
		return nextConfig;
	}, {});

	return Object.keys(columnWidthConfig).length > 0 ? columnWidthConfig : undefined;
}

export function normalizeBlockLookupViewConfig(config?: BlockLookupViewConfig | Record<string, unknown>): BlockLookupViewConfig {
	const columnKeySet = new Set<string>(BLOCK_LOOKUP_COLUMN_KEYS);
	const columnOrder = compactConfiguredOrder(config?.columnOrder, BLOCK_LOOKUP_COLUMN_KEYS);
	const normalizedConfig: BlockLookupViewConfig = {
		columnActiveConfig: compactRecord(config?.columnActiveConfig, columnKeySet, (value): value is boolean => typeof value === 'boolean'),
		columnWidthConfig: normalizeBlockLookupColumnWidthConfig(config?.columnWidthConfig),
		columnOrder: columnOrder && !defaultEquivalentOrder(columnOrder, BLOCK_LOOKUP_COLUMN_KEYS) ? columnOrder : undefined
	};

	if (config?.smallRows === true) {
		normalizedConfig.smallRows = true;
	}
	if (!normalizedConfig.columnActiveConfig) {
		delete normalizedConfig.columnActiveConfig;
	}
	if (!normalizedConfig.columnWidthConfig) {
		delete normalizedConfig.columnWidthConfig;
	}
	if (!normalizedConfig.columnOrder) {
		delete normalizedConfig.columnOrder;
	}

	return normalizedConfig;
}

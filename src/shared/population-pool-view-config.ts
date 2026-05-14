import { POPULATION_POOL_COLUMN_KEYS, type PopulationPoolColumnKey, type PopulationPoolViewConfig } from 'model';
import { compactConfiguredOrder, compactRecord, defaultEquivalentOrder, isFiniteNumber } from './view-config';

const POPULATION_POOL_COLUMN_KEY_SET = new Set<string>(POPULATION_POOL_COLUMN_KEYS);

const DEFAULT_WIDTHS: Record<PopulationPoolColumnKey, number> = {
	name: 260,
	source: 180,
	status: 190,
	compatibility: 220,
	path: 360
};

const MIN_WIDTHS: Record<PopulationPoolColumnKey, number> = {
	name: 160,
	source: 140,
	status: 140,
	compatibility: 180,
	path: 220
};

function isPopulationPoolColumnKey(value: string): value is PopulationPoolColumnKey {
	return POPULATION_POOL_COLUMN_KEY_SET.has(value);
}

function getDefaultPopulationPoolColumnWidth(column: PopulationPoolColumnKey) {
	return DEFAULT_WIDTHS[column];
}

function getMinPopulationPoolColumnWidth(column: PopulationPoolColumnKey) {
	return MIN_WIDTHS[column];
}

function normalizePopulationPoolColumnWidth(column: PopulationPoolColumnKey, width: unknown) {
	const minWidth = getMinPopulationPoolColumnWidth(column);
	const fallback = getDefaultPopulationPoolColumnWidth(column);
	return isFiniteNumber(width) ? Math.max(minWidth, Math.round(width)) : fallback;
}

export function normalizePopulationPoolViewConfig(config: unknown): PopulationPoolViewConfig {
	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		return {};
	}

	const record = config as Record<string, unknown>;
	const columnOrder = compactConfiguredOrder(record.columnOrder, POPULATION_POOL_COLUMN_KEYS);
	const columnActiveConfig = compactRecord<boolean>(
		record.columnActiveConfig,
		POPULATION_POOL_COLUMN_KEY_SET,
		(value): value is boolean => typeof value === 'boolean'
	);
	const rawWidths = compactRecord<number>(record.columnWidthConfig, POPULATION_POOL_COLUMN_KEY_SET, isFiniteNumber);
	const columnWidthConfig = rawWidths
		? Object.fromEntries(
				Object.entries(rawWidths)
					.filter((entry): entry is [PopulationPoolColumnKey, number] => isPopulationPoolColumnKey(entry[0]))
					.map(([column, width]) => [column, normalizePopulationPoolColumnWidth(column, width)])
			)
		: undefined;
	const normalized: PopulationPoolViewConfig = {
		...(columnOrder && !defaultEquivalentOrder(columnOrder, POPULATION_POOL_COLUMN_KEYS) ? { columnOrder } : {}),
		...(columnActiveConfig ? { columnActiveConfig } : {}),
		...(columnWidthConfig && Object.keys(columnWidthConfig).length > 0 ? { columnWidthConfig } : {}),
		...(typeof record.smallRows === 'boolean' ? { smallRows: record.smallRows } : {})
	};
	return normalized;
}

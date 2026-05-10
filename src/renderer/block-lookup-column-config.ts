import { BLOCK_LOOKUP_COLUMN_KEYS, type BlockLookupViewConfig } from 'model';
import { defaultEquivalentOrder, normalizedOrder } from './view-config-shared';
import {
	DEFAULT_BLOCK_LOOKUP_COLUMNS,
	cloneBlockLookupColumnConfig,
	type BlockLookupColumnConfig
} from './block-lookup-column-definitions';

export function getConfiguredBlockLookupColumns(config?: BlockLookupViewConfig): BlockLookupColumnConfig[] {
	const defaultColumns = cloneBlockLookupColumnConfig(DEFAULT_BLOCK_LOOKUP_COLUMNS);
	const columnByKey = new Map(defaultColumns.map((column) => [column.key, column]));
	const orderedKeys = normalizedOrder(config?.columnOrder, BLOCK_LOOKUP_COLUMN_KEYS);

	return orderedKeys.map((key) => {
		const column = columnByKey.get(key)!;
		const configuredWidth = config?.columnWidthConfig?.[key];
		return {
			...column,
			visible: config?.columnActiveConfig?.[key] !== false,
			width: typeof configuredWidth === 'number' ? Math.max(column.minWidth, Math.round(configuredWidth)) : undefined
		};
	});
}

export function blockLookupColumnsToConfig(columns: BlockLookupColumnConfig[], smallRows?: boolean): BlockLookupViewConfig {
	const defaultColumns = DEFAULT_BLOCK_LOOKUP_COLUMNS;
	const defaultColumnKeys = defaultColumns.map((column) => column.key);
	const defaultColumnKeySet = new Set<string>(defaultColumnKeys);
	const defaultColumnByKey = new Map(defaultColumns.map((column) => [column.key, column]));
	const uniqueColumns = normalizedOrder(
		columns.map((column) => column.key),
		defaultColumnKeys
	).map((key) => columns.find((column) => column.key === key) ?? defaultColumnByKey.get(key)!);
	const columnActiveConfig = uniqueColumns.reduce<Record<string, boolean>>((config, column) => {
		if (defaultColumnKeySet.has(column.key) && !column.visible) {
			config[column.key] = false;
		}
		return config;
	}, {});
	const columnWidthConfig = uniqueColumns.reduce<Record<string, number>>((config, column) => {
		if (defaultColumnKeySet.has(column.key) && typeof column.width === 'number') {
			config[column.key] = Math.max(column.minWidth, Math.round(column.width));
		}
		return config;
	}, {});
	const columnOrder = uniqueColumns.map((column) => column.key);

	return {
		smallRows: smallRows || undefined,
		columnActiveConfig: Object.keys(columnActiveConfig).length > 0 ? columnActiveConfig : undefined,
		columnWidthConfig: Object.keys(columnWidthConfig).length > 0 ? columnWidthConfig : undefined,
		columnOrder: defaultEquivalentOrder(columnOrder, defaultColumnKeys) ? undefined : columnOrder
	};
}

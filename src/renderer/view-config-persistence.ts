import {
	BlockLookupColumnTitles,
	MainColumnTitles,
	getMainColumnMinWidth,
	type AppConfig,
	type BlockLookupViewConfig,
	type MainCollectionConfig
} from 'model';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import type { BlockLookupColumnKey } from 'renderer/state/block-lookup-store';
import { writeConfig } from 'renderer/util/config-write';

export interface BlockLookupColumnConfig {
	key: BlockLookupColumnKey;
	title: BlockLookupColumnTitles;
	visible: boolean;
	width?: number;
	defaultWidth: number;
	minWidth: number;
}

export const DEFAULT_BLOCK_LOOKUP_COLUMNS: BlockLookupColumnConfig[] = [
	{ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, visible: true, defaultWidth: 360, minWidth: 180 },
	{ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, visible: true, defaultWidth: 220, minWidth: 120 },
	{ key: 'modTitle', title: BlockLookupColumnTitles.MOD, visible: true, defaultWidth: 200, minWidth: 120 },
	{ key: 'blockId', title: BlockLookupColumnTitles.BLOCK_ID, visible: true, defaultWidth: 110, minWidth: 90 },
	{ key: 'sourceKind', title: BlockLookupColumnTitles.SOURCE, visible: true, defaultWidth: 130, minWidth: 90 }
];

type ConfigCommit = (nextConfig: AppConfig) => void;

export function cloneBlockLookupColumnConfig(columns: BlockLookupColumnConfig[]) {
	return columns.map((column) => ({ ...column }));
}

function compactRecord<T>(record: Record<string, T>, validKeys: Set<string>, isValidValue: (value: T) => boolean) {
	const compacted = Object.entries(record).reduce<Record<string, T>>((nextRecord, [key, value]) => {
		if (validKeys.has(key) && isValidValue(value)) {
			nextRecord[key] = value;
		}
		return nextRecord;
	}, {});

	return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function normalizedOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	const defaultColumnSet = new Set<string>(defaultOrder);
	const configuredColumnSet = new Set<T>();
	const configuredColumns = (configuredOrder || []).filter((column): column is T => {
			if (!defaultColumnSet.has(column) || configuredColumnSet.has(column as T)) {
				return false;
			}
			configuredColumnSet.add(column as T);
			return true;
		}) as T[];

	return [...configuredColumns, ...defaultOrder.filter((column) => !configuredColumnSet.has(column))];
}

function compactOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	if (!configuredOrder) {
		return undefined;
	}

	const defaultColumnSet = new Set<string>(defaultOrder);
	const configuredColumnSet = new Set<T>();
	const configuredColumns = configuredOrder.filter((column): column is T => {
		if (!defaultColumnSet.has(column) || configuredColumnSet.has(column as T)) {
			return false;
		}
		configuredColumnSet.add(column as T);
		return true;
	}) as T[];

	return configuredColumns.length > 0 ? configuredColumns : undefined;
}

function defaultEquivalentOrder<T extends string>(order: readonly T[], defaultOrder: readonly T[]) {
	return order.length === defaultOrder.length && order.every((column, index) => column === defaultOrder[index]);
}

export function normalizeMainCollectionConfig(config?: MainCollectionConfig): MainCollectionConfig {
	const mainColumnTitles = Object.values(MainColumnTitles);
	const knownColumnSet = new Set<string>(mainColumnTitles);
	const columnOrder = compactOrder(config?.columnOrder, mainColumnTitles);
	const columnWidthConfig = compactRecord(config?.columnWidthConfig || {}, knownColumnSet, (width) => typeof width === 'number');

	const normalizedConfig: MainCollectionConfig = {
		...(config || {}),
		columnActiveConfig: compactRecord(config?.columnActiveConfig || {}, knownColumnSet, (active) => typeof active === 'boolean'),
		columnWidthConfig: columnWidthConfig
			? Object.entries(columnWidthConfig).reduce<Record<string, number>>((nextWidths, [column, width]) => {
					nextWidths[column] = Math.max(getMainColumnMinWidth(column as MainColumnTitles), Math.round(width));
					return nextWidths;
			  }, {})
			: undefined,
		columnOrder: columnOrder && !defaultEquivalentOrder(columnOrder, mainColumnTitles) ? columnOrder : undefined
	};

	if (config?.smallRows) {
		normalizedConfig.smallRows = true;
	} else {
		delete normalizedConfig.smallRows;
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

export function setMainCollectionColumnWidth(config: AppConfig, column: MainColumnTitles, width: number) {
	const normalizedWidth = Math.max(getMainColumnMinWidth(column), Math.round(width));
	if (config.viewConfigs.main?.columnWidthConfig?.[column] === normalizedWidth) {
		return undefined;
	}

	const nextConfig = cloneAppConfig(config);
	const nextMainConfig = normalizeMainCollectionConfig(nextConfig.viewConfigs.main);
	nextMainConfig.columnWidthConfig = {
		...(nextMainConfig.columnWidthConfig || {}),
		[column]: normalizedWidth
	};
	nextConfig.viewConfigs.main = nextMainConfig;
	return nextConfig;
}

export function setMainCollectionColumnVisibility(config: AppConfig, column: MainColumnTitles, visible: boolean) {
	const currentColumnActiveConfig = config.viewConfigs.main?.columnActiveConfig || {};
	const currentlyVisible = currentColumnActiveConfig[column] !== false;
	if (currentlyVisible === visible) {
		return undefined;
	}

	const nextConfig = cloneAppConfig(config);
	const nextMainConfig = normalizeMainCollectionConfig(nextConfig.viewConfigs.main);
	const nextColumnActiveConfig = { ...(nextMainConfig.columnActiveConfig || {}) };
	if (visible) {
		delete nextColumnActiveConfig[column];
	} else {
		nextColumnActiveConfig[column] = false;
	}

	nextMainConfig.columnActiveConfig = Object.keys(nextColumnActiveConfig).length > 0 ? nextColumnActiveConfig : undefined;
	nextConfig.viewConfigs.main = nextMainConfig;
	return nextConfig;
}

export function moveMainCollectionColumn(config: AppConfig, fromColumn: MainColumnTitles, toColumn: MainColumnTitles) {
	if (fromColumn === toColumn) {
		return undefined;
	}

	const defaultOrder = Object.values(MainColumnTitles);
	const currentOrder = normalizedOrder(config.viewConfigs.main?.columnOrder, defaultOrder);
	const fromIndex = currentOrder.indexOf(fromColumn);
	const toIndex = currentOrder.indexOf(toColumn);
	if (fromIndex === -1 || toIndex === -1) {
		return undefined;
	}

	const nextOrder = [...currentOrder];
	const [movedColumn] = nextOrder.splice(fromIndex, 1);
	nextOrder.splice(toIndex, 0, movedColumn);

	const nextConfig = cloneAppConfig(config);
	const nextMainConfig = normalizeMainCollectionConfig(nextConfig.viewConfigs.main);
	nextMainConfig.columnOrder = defaultEquivalentOrder(nextOrder, defaultOrder) ? undefined : nextOrder;
	nextConfig.viewConfigs.main = nextMainConfig;
	return nextConfig;
}

export function getConfiguredBlockLookupColumns(config?: BlockLookupViewConfig): BlockLookupColumnConfig[] {
	const defaultColumns = cloneBlockLookupColumnConfig(DEFAULT_BLOCK_LOOKUP_COLUMNS);
	const columnByTitle = new Map(defaultColumns.map((column) => [column.title, column]));
	const orderedTitles = normalizedOrder(config?.columnOrder, defaultColumns.map((column) => column.title));

	return orderedTitles.map((title) => {
		const column = columnByTitle.get(title)!;
		const configuredWidth = config?.columnWidthConfig?.[title];
		return {
			...column,
			visible: config?.columnActiveConfig?.[title] !== false,
			width: typeof configuredWidth === 'number' ? Math.max(column.minWidth, Math.round(configuredWidth)) : undefined
		};
	});
}

export function blockLookupColumnsToConfig(columns: BlockLookupColumnConfig[], smallRows?: boolean): BlockLookupViewConfig {
	const defaultColumns = DEFAULT_BLOCK_LOOKUP_COLUMNS;
	const defaultColumnTitles = defaultColumns.map((column) => column.title);
	const defaultColumnTitleSet = new Set<string>(defaultColumnTitles);
	const defaultColumnByTitle = new Map(defaultColumns.map((column) => [column.title, column]));
	const uniqueColumns = normalizedOrder(
		columns.map((column) => column.title),
		defaultColumnTitles
	).map((title) => columns.find((column) => column.title === title) ?? defaultColumnByTitle.get(title)!);
	const columnActiveConfig = uniqueColumns.reduce<Record<string, boolean>>((config, column) => {
		if (defaultColumnTitleSet.has(column.title) && !column.visible) {
			config[column.title] = false;
		}
		return config;
	}, {});
	const columnWidthConfig = uniqueColumns.reduce<Record<string, number>>((config, column) => {
		if (defaultColumnTitleSet.has(column.title) && typeof column.width === 'number') {
			config[column.title] = Math.max(column.minWidth, Math.round(column.width));
		}
		return config;
	}, {});
	const columnOrder = uniqueColumns.map((column) => column.title);

	return {
		smallRows: smallRows || undefined,
		columnActiveConfig: Object.keys(columnActiveConfig).length > 0 ? columnActiveConfig : undefined,
		columnWidthConfig: Object.keys(columnWidthConfig).length > 0 ? columnWidthConfig : undefined,
		columnOrder: defaultEquivalentOrder(columnOrder, defaultColumnTitles) ? undefined : columnOrder
	};
}

export function moveBlockLookupColumnByKey(
	columns: BlockLookupColumnConfig[],
	fromKey: BlockLookupColumnKey,
	toKey: BlockLookupColumnKey
) {
	const fromIndex = columns.findIndex((column) => column.key === fromKey);
	const toIndex = columns.findIndex((column) => column.key === toKey);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
		return columns;
	}

	const nextColumns = cloneBlockLookupColumnConfig(columns);
	const [column] = nextColumns.splice(fromIndex, 1);
	nextColumns.splice(toIndex, 0, column);
	return nextColumns;
}

export function setBlockLookupColumnWidth(config: AppConfig, columns: BlockLookupColumnConfig[], columnKey: BlockLookupColumnKey, width: number) {
	const nextColumns = columns.map((column) =>
		column.key === columnKey ? { ...column, width: Math.max(column.minWidth, Math.round(width)) } : column
	);
	const nextConfig = cloneAppConfig(config);
	nextConfig.viewConfigs.blockLookup = blockLookupColumnsToConfig(nextColumns, config.viewConfigs.blockLookup?.smallRows);
	return nextConfig;
}

export function setBlockLookupColumns(config: AppConfig, columns: BlockLookupColumnConfig[], smallRows?: boolean) {
	const nextConfig = cloneAppConfig(config);
	const nextColumns = columns.some((column) => column.visible) ? columns : getConfiguredBlockLookupColumns();
	nextConfig.viewConfigs.blockLookup = blockLookupColumnsToConfig(nextColumns, smallRows);
	return nextConfig;
}

export function moveBlockLookupColumn(config: AppConfig, columns: BlockLookupColumnConfig[], fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) {
	const nextColumns = moveBlockLookupColumnByKey(columns, fromKey, toKey);
	if (nextColumns === columns) {
		return undefined;
	}

	return setBlockLookupColumns(config, nextColumns, config.viewConfigs.blockLookup?.smallRows);
}

export async function persistViewConfig(nextConfig: AppConfig | undefined, commit: ConfigCommit) {
	if (!nextConfig) {
		return true;
	}

	await writeConfig(nextConfig);
	commit(nextConfig);
	return true;
}

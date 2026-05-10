import { BlockLookupColumnTitles, MainColumnTitles, type AppConfig, type BlockLookupViewConfig, type MainCollectionConfig } from 'model';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { getResolvedMainColumnMinWidth } from 'renderer/main-collection-column-layout';
import type { BlockLookupColumnKey } from 'renderer/state/block-lookup-store';

export interface BlockLookupColumnConfig {
	key: BlockLookupColumnKey;
	title: BlockLookupColumnTitles;
	visible: boolean;
	width?: number;
	defaultWidth: number;
	minWidth: number;
}

export const MAIN_DETAILS_OVERLAY_MIN_WIDTH = 360;
export const MAIN_DETAILS_OVERLAY_MIN_HEIGHT = 220;

interface BlockLookupTableOptionsDraft {
	columns: BlockLookupColumnConfig[];
	smallRows: boolean;
}

interface BlockLookupDraftColumnState {
	cannotHide: boolean;
	column: BlockLookupColumnConfig;
}

export const DEFAULT_BLOCK_LOOKUP_COLUMNS: BlockLookupColumnConfig[] = [
	{ key: 'preview', title: BlockLookupColumnTitles.PREVIEW, visible: true, defaultWidth: 92, minWidth: 76 },
	{ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, visible: true, defaultWidth: 320, minWidth: 140 },
	{ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, visible: true, defaultWidth: 200, minWidth: 96 },
	{ key: 'internalName', title: BlockLookupColumnTitles.INTERNAL_NAME, visible: true, defaultWidth: 220, minWidth: 136 },
	{ key: 'modTitle', title: BlockLookupColumnTitles.MOD, visible: true, defaultWidth: 176, minWidth: 96 }
];

function cloneBlockLookupColumnConfig(columns: BlockLookupColumnConfig[]) {
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

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function collectConfiguredColumnOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	const defaultColumnSet = new Set<string>(defaultOrder);
	const configuredColumnSet = new Set<T>();
	return (configuredOrder || []).filter((column): column is T => {
		if (!defaultColumnSet.has(column) || configuredColumnSet.has(column as T)) {
			return false;
		}
		configuredColumnSet.add(column as T);
		return true;
	}) as T[];
}

function normalizedOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	const configuredColumns = collectConfiguredColumnOrder(configuredOrder, defaultOrder);
	const configuredColumnSet = new Set(configuredColumns);
	return [...configuredColumns, ...defaultOrder.filter((column) => !configuredColumnSet.has(column))];
}

function compactOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	if (!configuredOrder) {
		return undefined;
	}

	const configuredColumns = collectConfiguredColumnOrder(configuredOrder, defaultOrder);

	return configuredColumns.length > 0 ? configuredColumns : undefined;
}

function defaultEquivalentOrder<T extends string>(order: readonly T[], defaultOrder: readonly T[]) {
	return order.length === defaultOrder.length && order.every((column, index) => column === defaultOrder[index]);
}

export function canSetMainColumnVisibility(columnTitle: MainColumnTitles, visible: boolean, columnActiveConfig?: Record<string, boolean>) {
	if (visible) {
		return true;
	}

	if (columnTitle === MainColumnTitles.ID && columnActiveConfig?.[MainColumnTitles.NAME] === false) {
		return false;
	}

	if (columnTitle === MainColumnTitles.NAME && columnActiveConfig?.[MainColumnTitles.ID] === false) {
		return false;
	}

	return true;
}

function normalizeMainColumnActiveConfig(config?: MainCollectionConfig) {
	const mainColumnTitles = Object.values(MainColumnTitles);
	const knownColumnSet = new Set<string>(mainColumnTitles);
	const columnActiveConfig = compactRecord(config?.columnActiveConfig || {}, knownColumnSet, (active) => typeof active === 'boolean');
	if (columnActiveConfig?.[MainColumnTitles.NAME] === false && columnActiveConfig[MainColumnTitles.ID] === false) {
		delete columnActiveConfig[MainColumnTitles.NAME];
	}
	return columnActiveConfig;
}

export function normalizeMainCollectionConfig(config?: MainCollectionConfig): MainCollectionConfig {
	const mainColumnTitles = Object.values(MainColumnTitles);
	const knownColumnSet = new Set<string>(mainColumnTitles);
	const columnOrder = compactOrder(config?.columnOrder, mainColumnTitles);
	const columnWidthConfig = compactRecord(config?.columnWidthConfig || {}, knownColumnSet, isFiniteNumber);

	const normalizedConfig: MainCollectionConfig = {
		...(config || {}),
		columnActiveConfig: normalizeMainColumnActiveConfig(config),
		columnWidthConfig: columnWidthConfig
			? Object.entries(columnWidthConfig).reduce<Record<string, number>>((nextWidths, [column, width]) => {
					nextWidths[column] = Math.max(getResolvedMainColumnMinWidth(column as MainColumnTitles), Math.round(width));
					return nextWidths;
				}, {})
			: undefined,
		detailsOverlayWidth: isFiniteNumber(config?.detailsOverlayWidth)
			? Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, Math.round(config.detailsOverlayWidth))
			: undefined,
		detailsOverlayHeight: isFiniteNumber(config?.detailsOverlayHeight)
			? Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, Math.round(config.detailsOverlayHeight))
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
	if (!normalizedConfig.detailsOverlayWidth) {
		delete normalizedConfig.detailsOverlayWidth;
	}
	if (!normalizedConfig.detailsOverlayHeight) {
		delete normalizedConfig.detailsOverlayHeight;
	}

	return normalizedConfig;
}

export function setMainCollectionDetailsOverlaySize(config: AppConfig, layout: 'side' | 'bottom', size: number | undefined) {
	const key = layout === 'side' ? 'detailsOverlayWidth' : 'detailsOverlayHeight';
	const normalizedSize = isFiniteNumber(size)
		? Math.max(layout === 'side' ? MAIN_DETAILS_OVERLAY_MIN_WIDTH : MAIN_DETAILS_OVERLAY_MIN_HEIGHT, Math.round(size))
		: undefined;
	if (config.viewConfigs.main?.[key] === normalizedSize) {
		return undefined;
	}

	const nextConfig = cloneAppConfig(config);
	const nextMainConfig = normalizeMainCollectionConfig(nextConfig.viewConfigs.main);
	if (typeof normalizedSize === 'number') {
		nextMainConfig[key] = normalizedSize;
	} else {
		delete nextMainConfig[key];
	}
	nextConfig.viewConfigs.main = normalizeMainCollectionConfig(nextMainConfig);
	return nextConfig;
}

export function setMainCollectionColumnWidth(config: AppConfig, column: MainColumnTitles, width: number) {
	const normalizedWidth = Math.max(getResolvedMainColumnMinWidth(column), Math.round(width));
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
	if (!canSetMainColumnVisibility(column, visible, currentColumnActiveConfig)) {
		return undefined;
	}

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
	const orderedTitles = normalizedOrder(
		config?.columnOrder,
		defaultColumns.map((column) => column.title)
	);

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

export function moveBlockLookupColumnByKey(columns: BlockLookupColumnConfig[], fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) {
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

export function createBlockLookupTableOptionsDraft(config?: BlockLookupViewConfig): BlockLookupTableOptionsDraft {
	return {
		columns: getConfiguredBlockLookupColumns(config),
		smallRows: !!config?.smallRows
	};
}

export function getBlockLookupDraftColumnStates(columns: BlockLookupColumnConfig[]): BlockLookupDraftColumnState[] {
	const visibleColumns = columns.filter((column) => column.visible).length;
	return columns.map((column) => ({
		column,
		cannotHide: column.visible && visibleColumns <= 1
	}));
}

export function setBlockLookupDraftColumnVisibility(columns: BlockLookupColumnConfig[], columnKey: BlockLookupColumnKey, visible: boolean) {
	const visibleColumns = columns.filter((column) => column.visible).length;
	if (!visible && visibleColumns <= 1) {
		return columns;
	}

	return columns.map((column) => (column.key === columnKey ? { ...column, visible } : column));
}

export function setBlockLookupDraftColumnWidth(
	columns: BlockLookupColumnConfig[],
	columnKey: BlockLookupColumnKey,
	width: number | undefined
) {
	return columns.map((column) => {
		if (column.key !== columnKey) {
			return column;
		}
		if (typeof width !== 'number') {
			const nextColumn = { ...column };
			delete nextColumn.width;
			return nextColumn;
		}

		return { ...column, width: Math.max(column.minWidth, Math.round(width)) };
	});
}

export function setBlockLookupColumnWidth(
	config: AppConfig,
	columns: BlockLookupColumnConfig[],
	columnKey: BlockLookupColumnKey,
	width: number
) {
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

export function moveBlockLookupColumn(
	config: AppConfig,
	columns: BlockLookupColumnConfig[],
	fromKey: BlockLookupColumnKey,
	toKey: BlockLookupColumnKey
) {
	const nextColumns = moveBlockLookupColumnByKey(columns, fromKey, toKey);
	if (nextColumns === columns) {
		return undefined;
	}

	return setBlockLookupColumns(config, nextColumns, config.viewConfigs.blockLookup?.smallRows);
}

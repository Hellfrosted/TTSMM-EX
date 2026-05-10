import { MainColumnTitles, type MainCollectionConfig } from 'model/MainCollectionView';
import { compactConfiguredOrder, compactRecord, defaultEquivalentOrder, isFiniteNumber } from './view-config';

const MAIN_DETAILS_OVERLAY_MIN_WIDTH = 360;
const MAIN_DETAILS_OVERLAY_MIN_HEIGHT = 220;
const DEFAULT_MAIN_COLUMN_MIN_WIDTH = 64;

const MAIN_COLUMN_MIN_WIDTHS: Partial<Record<MainColumnTitles, number>> = {
	[MainColumnTitles.TYPE]: 56,
	[MainColumnTitles.NAME]: 144,
	[MainColumnTitles.AUTHORS]: 40,
	[MainColumnTitles.STATE]: 40,
	[MainColumnTitles.ID]: 32,
	[MainColumnTitles.SIZE]: 32
};

const DEFAULT_MAIN_COLUMN_WIDTHS: Record<MainColumnTitles, number> = {
	[MainColumnTitles.TYPE]: 56,
	[MainColumnTitles.NAME]: 288,
	[MainColumnTitles.AUTHORS]: 88,
	[MainColumnTitles.STATE]: 64,
	[MainColumnTitles.ID]: 96,
	[MainColumnTitles.SIZE]: 64,
	[MainColumnTitles.LAST_UPDATE]: 104,
	[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 104,
	[MainColumnTitles.DATE_ADDED]: 104,
	[MainColumnTitles.TAGS]: 128
};

export function getMainColumnMinWidth(column: MainColumnTitles) {
	return MAIN_COLUMN_MIN_WIDTHS[column] ?? DEFAULT_MAIN_COLUMN_MIN_WIDTH;
}

function getHeaderMinimumWidth(column: MainColumnTitles) {
	return Math.ceil(column.length * 8 + 34);
}

export function getResolvedMainColumnMinWidth(column: MainColumnTitles) {
	return Math.max(getMainColumnMinWidth(column), getHeaderMinimumWidth(column));
}

export function getDefaultMainColumnWidth(column: MainColumnTitles) {
	return DEFAULT_MAIN_COLUMN_WIDTHS[column];
}

export function normalizeMainColumnWidth(column: MainColumnTitles, width: number) {
	return Math.max(getResolvedMainColumnMinWidth(column), Math.round(width));
}

function normalizeMainColumnActiveConfig(config?: MainCollectionConfig) {
	const mainColumnTitles = Object.values(MainColumnTitles);
	const knownColumnSet = new Set<string>(mainColumnTitles);
	const columnActiveConfig = compactRecord(
		config?.columnActiveConfig,
		knownColumnSet,
		(active): active is boolean => typeof active === 'boolean'
	);
	if (columnActiveConfig?.[MainColumnTitles.NAME] === false && columnActiveConfig[MainColumnTitles.ID] === false) {
		delete columnActiveConfig[MainColumnTitles.NAME];
	}
	return columnActiveConfig;
}

function normalizeMainColumnWidthConfig(config?: MainCollectionConfig) {
	const mainColumnTitles = Object.values(MainColumnTitles);
	const knownColumnSet = new Set<string>(mainColumnTitles);
	const columnWidthConfig = compactRecord(config?.columnWidthConfig, knownColumnSet, isFiniteNumber);
	if (!columnWidthConfig) {
		return undefined;
	}

	const normalizedWidths = Object.entries(columnWidthConfig).reduce<Record<string, number>>((nextWidths, [column, width]) => {
		const columnTitle = column as MainColumnTitles;
		const normalizedWidth = normalizeMainColumnWidth(columnTitle, width);
		if (normalizedWidth !== getDefaultMainColumnWidth(columnTitle)) {
			nextWidths[column] = normalizedWidth;
		}
		return nextWidths;
	}, {});
	return Object.keys(normalizedWidths).length > 0 ? normalizedWidths : undefined;
}

export function normalizeMainCollectionConfig(config?: MainCollectionConfig): MainCollectionConfig {
	const mainColumnTitles = Object.values(MainColumnTitles);
	const columnOrder = compactConfiguredOrder(config?.columnOrder, mainColumnTitles);

	const normalizedConfig: MainCollectionConfig = {
		columnActiveConfig: normalizeMainColumnActiveConfig(config),
		columnWidthConfig: normalizeMainColumnWidthConfig(config),
		detailsOverlayWidth: isFiniteNumber(config?.detailsOverlayWidth)
			? Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, Math.round(config.detailsOverlayWidth))
			: undefined,
		detailsOverlayHeight: isFiniteNumber(config?.detailsOverlayHeight)
			? Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, Math.round(config.detailsOverlayHeight))
			: undefined,
		columnOrder: columnOrder && !defaultEquivalentOrder(columnOrder, mainColumnTitles) ? columnOrder : undefined
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
	if (!normalizedConfig.detailsOverlayWidth) {
		delete normalizedConfig.detailsOverlayWidth;
	}
	if (!normalizedConfig.detailsOverlayHeight) {
		delete normalizedConfig.detailsOverlayHeight;
	}

	return normalizedConfig;
}

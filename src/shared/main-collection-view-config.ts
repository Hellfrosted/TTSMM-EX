import { type MainCollectionConfig, MainColumnTitles } from 'model/MainCollectionView';
import { isFiniteNumber, normalizeTableViewConfig } from './view-config';

export const MAIN_DETAILS_OVERLAY_MIN_WIDTH = 360;
export const MAIN_DETAILS_OVERLAY_MIN_HEIGHT = 220;
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

export function normalizeMainCollectionConfig(config?: MainCollectionConfig): MainCollectionConfig {
	const normalizedConfig: MainCollectionConfig = normalizeTableViewConfig(config, Object.values(MainColumnTitles), {
		normalizeWidth: normalizeMainColumnWidth,
		defaultWidth: getDefaultMainColumnWidth
	});
	const active = normalizedConfig.columnActiveConfig;
	if (active?.[MainColumnTitles.NAME] === false && active[MainColumnTitles.ID] === false) delete active[MainColumnTitles.NAME];
	if (isFiniteNumber(config?.detailsOverlayWidth)) {
		normalizedConfig.detailsOverlayWidth = Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, Math.round(config.detailsOverlayWidth));
	}
	if (isFiniteNumber(config?.detailsOverlayHeight)) {
		normalizedConfig.detailsOverlayHeight = Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, Math.round(config.detailsOverlayHeight));
	}
	return normalizedConfig;
}

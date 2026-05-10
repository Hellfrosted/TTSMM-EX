import { MainColumnTitles, type MainCollectionConfig } from 'model';
import { getResolvedMainColumnMinWidth } from 'renderer/main-collection-column-layout';
import { MAIN_DETAILS_OVERLAY_MIN_HEIGHT, MAIN_DETAILS_OVERLAY_MIN_WIDTH } from './main-view-config-constants';
import { compactOrder, compactRecord, defaultEquivalentOrder, isFiniteNumber } from './view-config-shared';

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

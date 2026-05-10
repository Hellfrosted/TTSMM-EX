import { MainColumnTitles, type AppConfig } from 'model';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { getResolvedMainColumnMinWidth } from 'renderer/main-collection-column-layout';
import { canSetMainColumnVisibility } from './main-column-visibility';
import { normalizeMainCollectionConfig } from './main-view-config-normalize';
import { defaultEquivalentOrder, normalizedOrder } from './view-config-shared';

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

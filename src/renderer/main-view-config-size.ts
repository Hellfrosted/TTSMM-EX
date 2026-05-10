import type { AppConfig } from 'model';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { MAIN_DETAILS_OVERLAY_MIN_HEIGHT, MAIN_DETAILS_OVERLAY_MIN_WIDTH } from './main-view-config-constants';
import { normalizeMainCollectionConfig } from './main-view-config-normalize';
import { isFiniteNumber } from './view-config-shared';

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

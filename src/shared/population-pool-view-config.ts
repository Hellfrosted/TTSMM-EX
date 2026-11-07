import { POPULATION_POOL_COLUMN_KEYS, type PopulationPoolColumnKey, type PopulationPoolViewConfig } from 'model/PopulationPoolView';
import { normalizeTableViewConfig } from './view-config';

const MIN_WIDTHS: Record<PopulationPoolColumnKey, number> = {
	name: 160,
	source: 140,
	status: 140,
	compatibility: 180,
	path: 220
};

export function normalizePopulationPoolViewConfig(config: unknown): PopulationPoolViewConfig {
	return normalizeTableViewConfig(config, POPULATION_POOL_COLUMN_KEYS, {
		normalizeWidth: (column, width) => Math.max(MIN_WIDTHS[column], Math.round(width)),
		preserveFalseSmallRows: true
	});
}

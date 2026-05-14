export const POPULATION_POOL_COLUMN_KEYS = ['name', 'source', 'status', 'compatibility', 'path'] as const;

export type PopulationPoolColumnKey = (typeof POPULATION_POOL_COLUMN_KEYS)[number];

export interface PopulationPoolViewConfig {
	columnOrder?: PopulationPoolColumnKey[];
	columnActiveConfig?: Partial<Record<PopulationPoolColumnKey, boolean>>;
	columnWidthConfig?: Partial<Record<PopulationPoolColumnKey, number>>;
	smallRows?: boolean;
}

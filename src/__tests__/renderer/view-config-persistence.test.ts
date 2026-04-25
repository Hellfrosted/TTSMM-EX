import { describe, expect, it } from 'vitest';
import { BlockLookupColumnTitles, MainColumnTitles, type BlockLookupViewConfig, type MainCollectionConfig } from '../../model';
import {
	blockLookupColumnsToConfig,
	getConfiguredBlockLookupColumns,
	moveMainCollectionColumn,
	normalizeMainCollectionConfig
} from '../../renderer/view-config-persistence';

describe('view-config-persistence', () => {
	it('normalizes main collection config by dropping unknown columns and clamping widths', () => {
		const config: MainCollectionConfig = {
			smallRows: false,
			columnActiveConfig: {
				[MainColumnTitles.NAME]: false,
				Legacy: false
			},
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 10,
				Legacy: 999
			},
			columnOrder: ['Legacy', MainColumnTitles.ID, MainColumnTitles.ID, MainColumnTitles.NAME]
		};

		expect(normalizeMainCollectionConfig(config)).toEqual({
			columnActiveConfig: {
				[MainColumnTitles.NAME]: false
			},
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 144
			},
			columnOrder: [MainColumnTitles.ID, MainColumnTitles.NAME]
		});
	});

	it('omits default main collection column order after moving back to default', () => {
		const nextConfig = moveMainCollectionColumn(
			{
				closeOnLaunch: false,
				language: 'en',
				gameExec: '',
				workshopID: 0n,
				logsDir: '',
				steamMaxConcurrency: 4,
				currentPath: '/',
				viewConfigs: {
					main: {
						columnOrder: [MainColumnTitles.NAME, MainColumnTitles.TYPE]
					}
				},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			MainColumnTitles.NAME,
			MainColumnTitles.TYPE
		);

		expect(nextConfig?.viewConfigs.main?.columnOrder).toBeUndefined();
	});

	it('normalizes block lookup config from persisted values', () => {
		const config: BlockLookupViewConfig = {
			smallRows: true,
			columnActiveConfig: {
				[BlockLookupColumnTitles.BLOCK]: false,
				Legacy: false
			},
			columnWidthConfig: {
				[BlockLookupColumnTitles.BLOCK]: 10,
				Legacy: 999
			},
			columnOrder: ['Legacy', BlockLookupColumnTitles.SOURCE, BlockLookupColumnTitles.SOURCE, BlockLookupColumnTitles.BLOCK]
		};

		const columns = getConfiguredBlockLookupColumns(config);

		expect(columns.map((column) => column.title)).toEqual([
			BlockLookupColumnTitles.SOURCE,
			BlockLookupColumnTitles.BLOCK,
			BlockLookupColumnTitles.SPAWN_COMMAND,
			BlockLookupColumnTitles.MOD,
			BlockLookupColumnTitles.BLOCK_ID
		]);
		expect(columns.find((column) => column.title === BlockLookupColumnTitles.BLOCK)).toMatchObject({
			visible: false,
			width: 120
		});
	});

	it('omits default block lookup config fields', () => {
		const columns = getConfiguredBlockLookupColumns();

		expect(blockLookupColumnsToConfig(columns)).toEqual({});
	});
});

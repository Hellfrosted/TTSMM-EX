import { describe, expect, it } from 'vitest';
import {
	BLOCK_LOOKUP_COLUMN_KEYS,
	BLOCK_LOOKUP_COLUMN_TITLES,
	BlockLookupColumnTitles,
	MainColumnTitles,
	type BlockLookupViewConfig,
	type MainCollectionConfig
} from '../../model';
import { canSetMainColumnVisibility } from '../../renderer/main-column-visibility';
import { moveMainCollectionColumn } from '../../renderer/main-view-config-columns';
import { setMainCollectionDetailsOverlaySize } from '../../renderer/main-view-config-size';
import { blockLookupColumnsToConfig, getConfiguredBlockLookupColumns } from '../../renderer/block-lookup-column-config';
import { DEFAULT_BLOCK_LOOKUP_COLUMNS } from '../../renderer/block-lookup-column-definitions';
import {
	createBlockLookupTableOptionsDraft,
	getBlockLookupDraftColumnStates,
	setBlockLookupDraftColumnVisibility,
	setBlockLookupDraftColumnWidth
} from '../../renderer/block-lookup-draft-config';
import { normalizeBlockLookupViewConfig } from '../../shared/block-lookup-view-config';
import { normalizeMainCollectionConfig } from '../../shared/main-collection-view-config';

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
				[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 10,
				Legacy: 999
			},
			columnOrder: ['Legacy', MainColumnTitles.ID, MainColumnTitles.ID, MainColumnTitles.NAME],
			detailsOverlayWidth: 111,
			detailsOverlayHeight: 99
		};

		expect(normalizeMainCollectionConfig(config)).toEqual({
			columnActiveConfig: {
				[MainColumnTitles.NAME]: false
			},
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 144,
				[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 154
			},
			columnOrder: [MainColumnTitles.ID, MainColumnTitles.NAME],
			detailsOverlayWidth: 360,
			detailsOverlayHeight: 220
		});
	});

	it('keeps either Name or ID visible in normalized main collection config', () => {
		expect(
			normalizeMainCollectionConfig({
				columnActiveConfig: {
					[MainColumnTitles.NAME]: false,
					[MainColumnTitles.ID]: false,
					[MainColumnTitles.TAGS]: false
				}
			})
		).toEqual({
			columnActiveConfig: {
				[MainColumnTitles.ID]: false,
				[MainColumnTitles.TAGS]: false
			}
		});

		expect(canSetMainColumnVisibility(MainColumnTitles.ID, false, { [MainColumnTitles.NAME]: false })).toBe(false);
		expect(canSetMainColumnVisibility(MainColumnTitles.NAME, false, { [MainColumnTitles.ID]: false })).toBe(false);
	});

	it('updates and clears main collection details overlay sizes', () => {
		const config = {
			closeOnLaunch: false,
			language: 'en',
			gameExec: '',
			workshopID: 0n,
			logsDir: '',
			steamMaxConcurrency: 4,
			currentPath: '/',
			viewConfigs: {
				main: {
					detailsOverlayWidth: 480,
					detailsOverlayHeight: 260
				}
			},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};

		expect(setMainCollectionDetailsOverlaySize(config, 'side', 128)?.viewConfigs.main).toMatchObject({
			detailsOverlayWidth: 360,
			detailsOverlayHeight: 260
		});
		expect(setMainCollectionDetailsOverlaySize(config, 'bottom', 300)?.viewConfigs.main).toMatchObject({
			detailsOverlayWidth: 480,
			detailsOverlayHeight: 300
		});
		expect(setMainCollectionDetailsOverlaySize(config, 'side', undefined)?.viewConfigs.main).toEqual({
			detailsOverlayHeight: 260
		});
	});

	it('rejects non-finite main collection details overlay sizes', () => {
		expect(
			normalizeMainCollectionConfig({
				detailsOverlayWidth: Number.POSITIVE_INFINITY,
				detailsOverlayHeight: Number.NaN
			})
		).toEqual({});

		const config = {
			closeOnLaunch: false,
			language: 'en',
			gameExec: '',
			workshopID: 0n,
			logsDir: '',
			steamMaxConcurrency: 4,
			currentPath: '/',
			viewConfigs: {
				main: {
					detailsOverlayWidth: 480,
					detailsOverlayHeight: 260
				}
			},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};

		expect(setMainCollectionDetailsOverlaySize(config, 'side', Number.POSITIVE_INFINITY)?.viewConfigs.main).toEqual({
			detailsOverlayHeight: 260
		});
		expect(setMainCollectionDetailsOverlaySize(config, 'bottom', Number.NaN)?.viewConfigs.main).toEqual({
			detailsOverlayWidth: 480
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
				blockName: false,
				Legacy: false
			},
			columnWidthConfig: {
				blockName: 10,
				preview: 92,
				Legacy: 999
			},
			columnOrder: ['Legacy', 'source', 'blockId', 'internalName', 'blockName']
		};

		const columns = getConfiguredBlockLookupColumns(config);

		expect(normalizeBlockLookupViewConfig(config)).toEqual({
			smallRows: true,
			columnActiveConfig: {
				blockName: false
			},
			columnWidthConfig: {
				blockName: 96
			},
			columnOrder: ['internalName', 'blockName']
		});
		expect(columns.map((column) => column.title)).toEqual([
			BlockLookupColumnTitles.INTERNAL_NAME,
			BlockLookupColumnTitles.BLOCK,
			BlockLookupColumnTitles.PREVIEW,
			BlockLookupColumnTitles.SPAWN_COMMAND,
			BlockLookupColumnTitles.MOD
		]);
		expect(columns.find((column) => column.title === BlockLookupColumnTitles.BLOCK)).toMatchObject({
			visible: false,
			width: 96
		});
	});

	it('derives default block lookup columns from canonical keys', () => {
		expect(BLOCK_LOOKUP_COLUMN_KEYS).toEqual(['preview', 'blockName', 'spawnCommand', 'internalName', 'modTitle']);
		expect(DEFAULT_BLOCK_LOOKUP_COLUMNS.map((column) => column.key)).toEqual(BLOCK_LOOKUP_COLUMN_KEYS);
		expect(DEFAULT_BLOCK_LOOKUP_COLUMNS.map((column) => column.title)).toEqual(
			BLOCK_LOOKUP_COLUMN_KEYS.map((key) => BLOCK_LOOKUP_COLUMN_TITLES[key])
		);
	});

	it('omits default block lookup config fields', () => {
		const columns = getConfiguredBlockLookupColumns();

		expect(blockLookupColumnsToConfig(columns)).toEqual({});
	});

	it('omits default-equivalent block lookup widths', () => {
		const columns = getConfiguredBlockLookupColumns().map((column) => ({
			...column,
			width: column.defaultWidth
		}));

		expect(blockLookupColumnsToConfig(columns).columnWidthConfig).toBeUndefined();
	});

	it('updates block lookup draft visibility without hiding the final visible column', () => {
		const columns = getConfiguredBlockLookupColumns().map((column) => ({
			...column,
			visible: column.title === BlockLookupColumnTitles.BLOCK
		}));

		expect(setBlockLookupDraftColumnVisibility(columns, 'blockName', false)).toBe(columns);
		expect(
			setBlockLookupDraftColumnVisibility(columns, 'spawnCommand', true).find((column) => column.key === 'spawnCommand')
		).toMatchObject({
			visible: true
		});
	});

	it('creates block lookup table option drafts from persisted config', () => {
		const draft = createBlockLookupTableOptionsDraft({
			smallRows: true,
			columnActiveConfig: {
				blockName: false
			}
		});

		expect(draft.smallRows).toBe(true);
		expect(draft.columns.find((column) => column.title === BlockLookupColumnTitles.BLOCK)).toMatchObject({
			visible: false
		});
	});

	it('marks only the final visible block lookup draft column as not hideable', () => {
		const columns = getConfiguredBlockLookupColumns().map((column) => ({
			...column,
			visible: column.title === BlockLookupColumnTitles.BLOCK
		}));

		expect(
			getBlockLookupDraftColumnStates(columns)
				.filter((state) => state.cannotHide)
				.map((state) => state.column.title)
		).toEqual([BlockLookupColumnTitles.BLOCK]);
	});

	it('updates and clears block lookup draft widths', () => {
		const columns = getConfiguredBlockLookupColumns({
			columnWidthConfig: {
				blockName: 220
			}
		});

		expect(setBlockLookupDraftColumnWidth(columns, 'blockName', 42).find((column) => column.key === 'blockName')).toMatchObject({
			width: 96
		});
		expect(setBlockLookupDraftColumnWidth(columns, 'blockName', undefined).find((column) => column.key === 'blockName')).not.toHaveProperty(
			'width'
		);
	});
});

import { describe, expect, it } from 'vitest';
import { MainColumnTitles } from '../../model';
import {
	createMainTableSettingsFormValues,
	toMainCollectionConfig
} from '../../renderer/collection-manager-form-validation';

describe('collection-manager-form-validation', () => {
	it('drops stale unknown column settings before rendering the table settings form', () => {
		const values = createMainTableSettingsFormValues({
			columnActiveConfig: {
				[MainColumnTitles.NAME]: true,
				Legacy: false
			},
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 180,
				Legacy: 240
			},
			columnOrder: ['Legacy', MainColumnTitles.NAME]
		});

		expect(values.columnActiveConfig).toEqual({
			[MainColumnTitles.NAME]: true
		});
		expect(values.columnWidthConfig).toEqual({
			[MainColumnTitles.NAME]: 180
		});
	});

	it('persists only known table columns and clamps widths to the column minimum', () => {
		const config = toMainCollectionConfig(
			{
				smallRows: false,
				columnActiveConfig: {
					[MainColumnTitles.NAME]: true,
					Legacy: false
				},
				columnWidthConfig: {
					[MainColumnTitles.NAME]: 20,
					Legacy: 240
				}
			},
			{
				columnOrder: ['Legacy', MainColumnTitles.NAME, MainColumnTitles.NAME]
			}
		);

		expect(config).toEqual({
			columnActiveConfig: {
				[MainColumnTitles.NAME]: true
			},
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 144
			},
			columnOrder: [MainColumnTitles.NAME]
		});
	});
});

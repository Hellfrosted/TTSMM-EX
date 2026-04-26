import { describe, expect, it } from 'vitest';
import { MainColumnTitles } from '../../model';
import { createMainCollectionTableModel } from '../../renderer/components/collections/main-collection-table-model';

describe('main-collection-table-model', () => {
	it('returns the default active columns with no hidden columns', () => {
		const model = createMainCollectionTableModel({});

		expect(model.manuallyActiveColumnTitles).toEqual(Object.values(MainColumnTitles));
		expect(model.activeColumnTitles).toEqual(Object.values(MainColumnTitles));
		expect(model.hiddenColumnTitles).toEqual([]);
	});

	it('applies configured order and manual visibility before responsive width rules', () => {
		const model = createMainCollectionTableModel({
			config: {
				columnOrder: [MainColumnTitles.ID, MainColumnTitles.NAME],
				columnActiveConfig: {
					[MainColumnTitles.AUTHORS]: false
				}
			},
			availableTableWidth: 900
		});

		expect(model.manuallyActiveColumnTitles.slice(0, 2)).toEqual([MainColumnTitles.ID, MainColumnTitles.NAME]);
		expect(model.manuallyActiveColumnTitles).not.toContain(MainColumnTitles.AUTHORS);
		expect(model.hiddenColumnTitles).toEqual([MainColumnTitles.AUTHORS]);
		expect(model.activeColumnTitles).toEqual([MainColumnTitles.ID, MainColumnTitles.NAME, MainColumnTitles.TYPE, MainColumnTitles.STATE]);
	});
});

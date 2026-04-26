import { describe, expect, it } from 'vitest';
import { MainColumnTitles, ModType, compareModDataDisplayName, type DisplayModData } from '../../model';
import {
	createMainCollectionTableModel,
	getMainCollectionDefaultSortState,
	sortMainCollectionRows
} from '../../renderer/components/collections/main-collection-table-model';

function createRow(uid: string, name: string, size: number): DisplayModData {
	return {
		uid,
		type: ModType.WORKSHOP,
		workshopID: BigInt(uid.replace('workshop:', '')),
		id: name,
		name,
		size,
		subscribed: true,
		installed: true
	};
}

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

	it('sorts rows through configured column comparators', () => {
		const rows = [createRow('workshop:3', 'Charlie', 100), createRow('workshop:1', 'Alpha', 300), createRow('workshop:2', 'Bravo', 200)];
		const columns = [
			{ title: MainColumnTitles.NAME, sorter: compareModDataDisplayName },
			{ title: MainColumnTitles.SIZE, sorter: (left: DisplayModData, right: DisplayModData) => (left.size || 0) - (right.size || 0) }
		];

		expect(sortMainCollectionRows(rows, columns, { columnTitle: MainColumnTitles.NAME, order: 'ascend' }).map((row) => row.name)).toEqual([
			'Alpha',
			'Bravo',
			'Charlie'
		]);
		expect(sortMainCollectionRows(rows, columns, { columnTitle: MainColumnTitles.SIZE, order: 'descend' }).map((row) => row.name)).toEqual([
			'Alpha',
			'Bravo',
			'Charlie'
		]);
	});

	it('keeps valid sort state and falls back to the name column when needed', () => {
		const columns = [{ title: MainColumnTitles.NAME, sorter: compareModDataDisplayName }, { title: MainColumnTitles.ID }];
		const validSortState = { columnTitle: MainColumnTitles.NAME, order: 'descend' as const };

		expect(getMainCollectionDefaultSortState(columns, validSortState)).toBe(validSortState);
		expect(getMainCollectionDefaultSortState(columns, { columnTitle: MainColumnTitles.ID, order: 'ascend' })).toEqual({
			columnTitle: MainColumnTitles.NAME,
			order: 'ascend'
		});
	});
});

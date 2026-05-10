import { describe, expect, it } from 'vitest';
import { ModType, SessionMods } from '../../model';
import type { ModData } from '../../model';
import {
	filterCollectionRows,
	getCollectionModDataList,
	getCollectionRows,
	getCollectionSelectionState,
	getDisplayedCollectionRecord,
	getVisibleCollectionRows,
	setVisibleCollectionRowsSelected
} from '../../renderer/collection-mod-projection';

function sessionWithRows(rows: ModData[]) {
	const session = new SessionMods('', rows);
	rows.forEach((row) => {
		session.modIdToModDataMap.set(row.uid, row);
	});
	return session;
}

describe('collection-mod-projection', () => {
	it('projects collection rows from the session lookup map', () => {
		const workshop = { uid: 'workshop:1', id: 'WorkshopOne', type: ModType.WORKSHOP };
		const local = { uid: 'local:one', id: 'LocalOne', type: ModType.LOCAL };
		const session = sessionWithRows([workshop, local]);

		expect(getCollectionRows(session)).toEqual([workshop, local]);
	});

	it('filters rows by display text, authors, normal tags, override tags, and corp aliases', () => {
		const rows: ModData[] = [
			{
				uid: 'workshop:1',
				id: 'HumanReadableId',
				name: 'Paint Pack',
				type: ModType.WORKSHOP,
				authors: ['Alice'],
				tags: ['Blocks']
			},
			{
				uid: 'local:one',
				id: 'LocalOne',
				name: 'Utility Mod',
				type: ModType.LOCAL,
				authors: ['Bob'],
				tags: ['hawkeye'],
				overrides: {
					tags: ['CustomOverride']
				}
			}
		];
		const session = sessionWithRows(rows);

		expect(getVisibleCollectionRows(session, 'human')).toEqual([rows[0]]);
		expect(filterCollectionRows(rows, 'bob')).toEqual([rows[1]]);
		expect(filterCollectionRows(rows, 'customoverride')).toEqual([rows[1]]);
		expect(filterCollectionRows(rows, 'he')).toEqual([rows[1]]);
	});

	it('uses the latest session record for the displayed details row and falls back to the current record', () => {
		const staleRecord = { uid: 'workshop:1', id: 'Old', name: 'Old Name', type: ModType.WORKSHOP };
		const refreshedRecord = { uid: 'workshop:1', id: 'New', name: 'New Name', type: ModType.WORKSHOP };
		const session = sessionWithRows([refreshedRecord]);

		expect(getDisplayedCollectionRecord(session, staleRecord)).toBe(refreshedRecord);
		expect(getDisplayedCollectionRecord(session, { uid: 'missing', id: 'Missing', type: ModType.LOCAL })).toEqual({
			uid: 'missing',
			id: 'Missing',
			type: ModType.LOCAL
		});
		expect(getDisplayedCollectionRecord(session, undefined)).toBeUndefined();
	});

	it('maps selected collection mod ids to available mod data', () => {
		const available = { uid: 'workshop:1', id: 'Available', type: ModType.WORKSHOP };
		const session = sessionWithRows([available]);

		expect(getCollectionModDataList(session, { mods: ['missing', 'workshop:1'] })).toEqual([available]);
		expect(getCollectionModDataList(session, undefined)).toEqual([]);
	});

	it('derives visible selection state and applies bulk visible selection changes', () => {
		const visibleRows = [
			{ uid: 'a', id: 'A', type: ModType.LOCAL },
			{ uid: 'b', id: 'B', type: ModType.LOCAL }
		];

		expect(getCollectionSelectionState(['a', 'hidden'], visibleRows)).toMatchObject({
			visibleModIds: ['a', 'b'],
			selectedVisibleCount: 1,
			allVisibleSelected: false,
			someVisibleSelected: true
		});
		expect([...setVisibleCollectionRowsSelected(['a', 'hidden'], visibleRows, true)].sort()).toEqual(['a', 'b', 'hidden']);
		expect([...setVisibleCollectionRowsSelected(['a', 'hidden'], visibleRows, false)].sort()).toEqual(['hidden']);
	});
});

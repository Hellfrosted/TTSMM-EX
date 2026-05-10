import { describe, expect, it } from 'vitest';
import { ModType, SessionMods } from '../../model';
import type { ModData } from '../../model';
import {
	filterCollectionRows,
	filterCollectionRowsByTags,
	getCollectionRowFilterTags,
	getVisibleCollectionRows
} from '../../renderer/collection-mod-row-filter';
import { getCollectionModDataList } from '../../renderer/collection-mod-list';
import { getCollectionRows, getCollectionRowsWithMissingSelections } from '../../renderer/collection-mod-row-source';
import { getDisplayedCollectionRecord, projectCollectionRowsWithErrors } from '../../renderer/collection-mod-display';
import { getCollectionSelectionState, setVisibleCollectionRowsSelected } from '../../renderer/collection-mod-selection';

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
				tags: ['Blocks', 'bf']
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
		expect(filterCollectionRows(rows, 'Better Future')).toEqual([rows[0]]);
		expect(getCollectionRowFilterTags(rows[0])).toEqual(['Blocks', 'Better Future']);
		expect(filterCollectionRowsByTags(rows, ['Better Future'])).toEqual([rows[0]]);
	});

	it('filters rows by uid and workshop id text', () => {
		const rows: ModData[] = [
			{
				uid: 'workshop:2793060967',
				id: null,
				name: 'Workshop item 2793060967',
				type: ModType.WORKSHOP,
				workshopID: BigInt(2793060967)
			},
			{
				uid: 'local:one',
				id: 'LocalOne',
				name: 'Utility Mod',
				type: ModType.LOCAL
			}
		];

		expect(filterCollectionRows(rows, '27')).toEqual([rows[0]]);
		expect(filterCollectionRows(rows, 'workshop:279')).toEqual([rows[0]]);
	});

	it('adds missing selected workshop ids as searchable placeholder rows', () => {
		const available = { uid: 'local:one', id: 'LocalOne', type: ModType.LOCAL };
		const session = sessionWithRows([available]);

		const rows = getCollectionRowsWithMissingSelections(session, {
			name: 'default',
			mods: ['local:one', 'workshop:2793060967']
		});

		expect(rows).toEqual([
			available,
			expect.objectContaining({
				uid: 'workshop:2793060967',
				id: null,
				type: ModType.WORKSHOP,
				workshopID: BigInt(2793060967),
				name: 'Workshop item 2793060967'
			})
		]);
		expect(filterCollectionRows(rows, '27')).toEqual([rows[1]]);
	});

	it('ignores non-printable workshop tags when filtering', () => {
		const rows: ModData[] = [
			{ uid: 'workshop:1', id: 'BadTag', name: 'Bad Tag Mod', type: ModType.WORKSHOP, tags: ['\u0000\u0000\u0000\u0000'] },
			{ uid: 'workshop:2', id: 'GoodTag', name: 'Good Tag Mod', type: ModType.WORKSHOP, tags: ['Blocks', ' mods ', 'bf'] }
		];

		expect(getCollectionRowFilterTags(rows[0])).toEqual([]);
		expect(getCollectionRowFilterTags(rows[1])).toEqual(['Blocks', 'Better Future']);
		expect(filterCollectionRows(rows, '\u0000')).toEqual([]);
		expect(filterCollectionRows(rows, 'bf')).toEqual([rows[1]]);
		expect(filterCollectionRowsByTags(rows, ['Better Future'])).toEqual([rows[1]]);
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

	it('projects validation errors onto rows without mutating session records', () => {
		const rowWithStaleErrors = {
			uid: 'workshop:1',
			id: 'WorkshopOne',
			type: ModType.WORKSHOP,
			errors: { notInstalled: true }
		};
		const rowWithNextErrors = { uid: 'local:one', id: 'LocalOne', type: ModType.LOCAL };
		const nextErrors = { 'local:one': { invalidId: true } };

		const projectedRows = projectCollectionRowsWithErrors([rowWithStaleErrors, rowWithNextErrors], nextErrors);

		expect(projectedRows).toEqual([
			{ uid: 'workshop:1', id: 'WorkshopOne', type: ModType.WORKSHOP },
			{ uid: 'local:one', id: 'LocalOne', type: ModType.LOCAL, errors: { invalidId: true } }
		]);
		expect(rowWithStaleErrors.errors).toEqual({ notInstalled: true });
		expect(rowWithNextErrors).not.toHaveProperty('errors');
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

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModType, SessionMods } from '../../model';
import { useCollectionRowProjection } from '../../renderer/hooks/collections/useCollectionRowProjection';

function createMods() {
	const rows = [
		{
			uid: 'workshop:paint',
			id: 'PaintPack',
			name: 'Paint Pack',
			type: ModType.WORKSHOP,
			authors: ['Alice'],
			tags: ['Blocks']
		},
		{
			uid: 'local:utility',
			id: 'UtilityMod',
			name: 'Utility Mod',
			type: ModType.LOCAL,
			authors: ['Bob'],
			tags: ['hawkeye']
		}
	];
	const mods = new SessionMods('', rows);
	rows.forEach((row) => {
		mods.modIdToModDataMap.set(row.uid, row);
	});
	return mods;
}

describe('useCollectionRowProjection', () => {
	it('filters Collection workspace rows on search change and clears the projection for an empty query', async () => {
		const { result } = renderHook(() => useCollectionRowProjection({ mods: createMods() }));

		act(() => {
			result.current.onSearchChange('paint');
		});

		await waitFor(() => {
			expect(result.current.searchString).toBe('paint');
			expect(result.current.filteredRows?.map((row) => row.uid)).toEqual(['workshop:paint']);
		});

		act(() => {
			result.current.onSearchChange('');
		});

		await waitFor(() => {
			expect(result.current.searchString).toBe('');
			expect(result.current.filteredRows).toBeUndefined();
		});
	});

	it('recalculates rows from the latest submitted query', async () => {
		const mods = createMods();
		const { result } = renderHook(() => useCollectionRowProjection({ mods }));

		act(() => {
			result.current.onSearch('hawkeye');
		});
		await waitFor(() => {
			expect(result.current.filteredRows?.map((row) => row.uid)).toEqual(['local:utility']);
		});

		act(() => {
			mods.modIdToModDataMap.set('local:extra', {
				uid: 'local:extra',
				id: 'Extra',
				name: 'Extra Utility',
				type: ModType.LOCAL,
				tags: ['hawkeye']
			});
			result.current.recalculateModData();
		});

		await waitFor(() => {
			expect(result.current.filteredRows?.map((row) => row.uid)).toEqual(['local:utility', 'local:extra']);
		});
	});

	it('keeps the row projection empty when recalculating without a query', async () => {
		const { result } = renderHook(() => useCollectionRowProjection({ mods: createMods() }));

		act(() => {
			result.current.recalculateModData();
		});

		await waitFor(() => {
			expect(result.current.filteredRows).toBeUndefined();
		});
	});
});

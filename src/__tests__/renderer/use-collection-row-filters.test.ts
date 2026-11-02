import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModType } from '../../model';
import { useCollectionRowFilters } from '../../renderer/views/use-collection-row-filters';

const rows = [
	{ uid: 'one', id: 'one', type: ModType.LOCAL, tags: ['Blocks'] },
	{ uid: 'two', id: 'two', type: ModType.LOCAL, tags: ['Wheels'] }
];

describe('collection row filters', () => {
	it('combines search results and tags, counts selected visible rows, and prunes unavailable tags', () => {
		const { result, rerender } = renderHook((props) => useCollectionRowFilters(props), {
			initialProps: { baseRows: rows, rows, filteredRows: rows, selectedModIds: ['one', 'two'], searchString: ' search ' }
		});
		expect(result.current.availableFilterTags).toEqual(['Blocks', 'Wheels']);
		act(() => result.current.setSelectedFilterTags(['Blocks']));
		expect(result.current.visibleRows).toEqual([rows[0]]);
		expect(result.current.visibleSelectedCount).toBe(1);
		expect(result.current.activeFilterCount).toBe(2);
		rerender({ baseRows: [rows[1]], rows: [rows[1]], filteredRows: [rows[1]], selectedModIds: ['one', 'two'], searchString: '' });
		expect(result.current.selectedFilterTags).toEqual([]);
		expect(result.current.visibleRows).toEqual([rows[1]]);
		expect(result.current.activeFilterCount).toBe(0);
	});
});

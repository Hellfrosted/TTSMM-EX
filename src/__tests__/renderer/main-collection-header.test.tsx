import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainColumnTitles } from '../../model';
import {
	MainCollectionVirtualHeaderRow,
	ResizableHeaderCell,
	canSetMainColumnVisibility,
	getNextMainCollectionSortState
} from '../../renderer/components/collections/main-collection-header';

afterEach(() => {
	cleanup();
});

describe('main-collection-header', () => {
	it('cycles sorted columns without an unsorted state', () => {
		expect(getNextMainCollectionSortState({ columnTitle: 'Name', order: 'ascend' }, 'Size')).toEqual({
			columnTitle: 'Size',
			order: 'ascend'
		});
		expect(getNextMainCollectionSortState({ columnTitle: 'Size', order: 'ascend' }, 'Size')).toEqual({
			columnTitle: 'Size',
			order: 'descend'
		});
		expect(getNextMainCollectionSortState({ columnTitle: 'Size', order: 'descend' }, 'Size')).toEqual({
			columnTitle: 'Size',
			order: 'ascend'
		});
	});

	it('keeps either ID or Name visible when hiding main columns', () => {
		expect(canSetMainColumnVisibility(MainColumnTitles.ID, false, { [MainColumnTitles.NAME]: false })).toBe(false);
		expect(canSetMainColumnVisibility(MainColumnTitles.NAME, false, { [MainColumnTitles.ID]: false })).toBe(false);
		expect(canSetMainColumnVisibility(MainColumnTitles.TAGS, false, { [MainColumnTitles.ID]: false })).toBe(true);
		expect(canSetMainColumnVisibility(MainColumnTitles.ID, true, { [MainColumnTitles.NAME]: false })).toBe(true);
	});

	it('renders sortable header cells and dispatches sort updates', () => {
		const onSortStateChange = vi.fn();
		render(
			<table>
				<thead>
					<MainCollectionVirtualHeaderRow
						columns={[{ title: 'Name', width: 180, sorter: vi.fn() }]}
						selectionControl={<input type="checkbox" aria-label="select visible rows" />}
						sortState={{ columnTitle: 'Name', order: 'ascend' }}
						sortedRowsCount={3}
						getHeaderCellProps={(column) => ({ 'data-column-title': column.title, width: column.width })}
						isColumnSortable={(column) => !!column.sorter}
						onSortStateChange={onSortStateChange}
					/>
				</thead>
			</table>
		);

		fireEvent.click(screen.getByRole('button', { name: /Name/ }));
		const [sortUpdater] = onSortStateChange.mock.calls[0];

		expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending');
		expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveStyle({
			width: '180px'
		});
		expect(sortUpdater({ columnTitle: 'Name', order: 'ascend' })).toEqual({ columnTitle: 'Name', order: 'descend' });
	});

	it('reports keyboard resize previews and resize completion', () => {
		const onResize = vi.fn();
		const onResizeEnd = vi.fn();
		render(
			<table>
				<thead>
					<tr>
						<ResizableHeaderCell label="Name" width={160} resizeWidth={160} minWidth={80} onResize={onResize} onResizeEnd={onResizeEnd}>
							Name
						</ResizableHeaderCell>
					</tr>
				</thead>
			</table>
		);

		fireEvent.keyDown(screen.getByRole('slider', { name: 'Resize Name' }), { key: 'ArrowRight' });

		expect(onResize).toHaveBeenCalledWith(176);
		expect(onResizeEnd).toHaveBeenCalledWith(176);
	});
});

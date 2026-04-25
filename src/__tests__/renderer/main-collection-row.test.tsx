import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	MainCollectionVirtualRow,
	renderMainCollectionCellValue,
	type MainCollectionRowColumn
} from '../../renderer/components/collections/main-collection-row';
import { DisplayModData, ModType } from '../../model';
import { formatDateStr } from '../../util/Date';

afterEach(() => {
	cleanup();
});

function createRecord(overrides: Partial<DisplayModData> = {}): DisplayModData {
	return {
		uid: 'workshop:3264187221',
		type: ModType.WORKSHOP,
		workshopID: BigInt(3264187221),
		id: 'HumanReadableModId',
		name: 'HHI Custom Paint GT',
		subscribed: true,
		installed: true,
		...overrides
	};
}

describe('main-collection-row', () => {
	it('renders cell values through custom renderers before falling back to record fields', () => {
		const record = createRecord();
		const column: MainCollectionRowColumn = {
			title: 'Name',
			dataIndex: 'name',
			render: (value, row, rowIndex) => `${rowIndex}:${row.uid}:${value}`
		};

		expect(renderMainCollectionCellValue(column, record, 7)).toBe('7:workshop:3264187221:HHI Custom Paint GT');
		expect(renderMainCollectionCellValue({ title: 'ID', dataIndex: 'id' }, record, 0)).toBe('HumanReadableModId');
	});

	it('formats date fallback values consistently with collection table dates', () => {
		const dateAdded = new Date(2026, 3, 12, 9, 30);
		const record = createRecord({ dateAdded });

		expect(renderMainCollectionCellValue({ title: 'Date Added', dataIndex: 'dateAdded' }, record, 0)).toBe(formatDateStr(dateAdded));
	});

	it('renders selection and cell presentation for a virtual row', () => {
		const onSelectedChange = vi.fn();
		const onContextMenu = vi.fn();
		const measureElement = vi.fn();
		const record = createRecord();

		render(
			<table>
				<tbody>
					<MainCollectionVirtualRow
						columns={[{ title: 'ID', dataIndex: 'id', width: 140 }]}
						measureElement={measureElement}
						record={record}
						rowId={record.uid}
						rowIndex={2}
						selected={true}
						start={96}
						onContextMenu={onContextMenu}
						onSelectedChange={onSelectedChange}
					/>
				</tbody>
			</table>
		);

		fireEvent.click(screen.getByRole('checkbox', { name: 'Include HumanReadableModId in collection' }));
		fireEvent.contextMenu(screen.getByText('HumanReadableModId').closest('tr') as HTMLTableRowElement);

		expect(screen.getByText('HumanReadableModId')).toBeInTheDocument();
		expect(onSelectedChange).toHaveBeenCalledWith(record, false);
		expect(onContextMenu).toHaveBeenCalledTimes(1);
		expect(measureElement).toHaveBeenCalled();
	});
});

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	MainCollectionVirtualRow,
	getMainCollectionCellContent,
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
		const renderContext = { activateRow: vi.fn(), openDetails: vi.fn() };
		const column: MainCollectionRowColumn = {
			title: 'Name',
			dataIndex: 'name',
			render: (value, row, rowIndex) => `${rowIndex}:${row.uid}:${value}`
		};

		expect(getMainCollectionCellContent(column, record, 7, renderContext)).toBe('7:workshop:3264187221:HHI Custom Paint GT');
		expect(getMainCollectionCellContent({ title: 'ID', dataIndex: 'id' }, record, 0, renderContext)).toBe('HumanReadableModId');
	});

	it('formats date fallback values consistently with collection table dates', () => {
		const dateAdded = new Date(2026, 3, 12, 9, 30);
		const record = createRecord({ dateAdded });

		expect(
			getMainCollectionCellContent({ title: 'Date Added', dataIndex: 'dateAdded' }, record, 0, {
				activateRow: vi.fn(),
				openDetails: vi.fn()
			})
		).toBe(formatDateStr(dateAdded));
	});

	it('renders selection and cell presentation for a virtual row', () => {
		const onSelectedChange = vi.fn();
		const onContextMenu = vi.fn();
		const onOpenDetails = vi.fn();
		const onRowHighlight = vi.fn();
		const measureElement = vi.fn();
		const record = createRecord();

		render(
			<table>
				<tbody>
					<MainCollectionVirtualRow
						columns={[{ title: 'ID', dataIndex: 'id', width: 140 }]}
						highlighted={true}
						measureElement={measureElement}
						record={record}
						rowIndex={2}
						selected={true}
						start={96}
						tableWidth={320}
						onContextMenu={onContextMenu}
						onOpenDetails={onOpenDetails}
						onRowHighlight={onRowHighlight}
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

	it('highlights rows from mouse and keyboard interaction and opens details on double click', () => {
		const onSelectedChange = vi.fn();
		const onOpenDetails = vi.fn();
		const onRowHighlight = vi.fn();
		const record = createRecord();

		render(
			<table>
				<tbody>
					<MainCollectionVirtualRow
						columns={[{ title: 'ID', dataIndex: 'id', width: 140 }]}
						highlighted={false}
						measureElement={vi.fn()}
						record={record}
						rowIndex={2}
						selected={false}
						start={96}
						tableWidth={320}
						onContextMenu={vi.fn()}
						onOpenDetails={onOpenDetails}
						onRowHighlight={onRowHighlight}
						onSelectedChange={onSelectedChange}
					/>
				</tbody>
			</table>
		);

		const row = screen.getByText('HumanReadableModId').closest('tr') as HTMLTableRowElement;
		expect(row).toHaveAttribute('aria-roledescription', 'selectable row');
		expect(row).toHaveAttribute('aria-keyshortcuts', 'Enter Space');
		expect(row).toHaveAccessibleName('Mod row for HumanReadableModId. Press Enter or Space to select the row.');
		fireEvent.click(row);
		fireEvent.keyDown(row, { key: 'Enter' });
		fireEvent.doubleClick(row);

		expect(onRowHighlight).toHaveBeenCalledWith(record);
		expect(onRowHighlight).toHaveBeenCalledTimes(2);
		expect(onOpenDetails).toHaveBeenCalledWith(record);
		expect(onSelectedChange).not.toHaveBeenCalled();
	});

	it('opens details from single row activation when details are already open', () => {
		const onSelectedChange = vi.fn();
		const onOpenDetails = vi.fn();
		const onRowHighlight = vi.fn();
		const record = createRecord();

		render(
			<table>
				<tbody>
					<MainCollectionVirtualRow
						columns={[{ title: 'ID', dataIndex: 'id', width: 140 }]}
						detailsOpen
						highlighted={false}
						measureElement={vi.fn()}
						record={record}
						rowIndex={2}
						selected={false}
						start={96}
						tableWidth={320}
						onContextMenu={vi.fn()}
						onOpenDetails={onOpenDetails}
						onRowHighlight={onRowHighlight}
						onSelectedChange={onSelectedChange}
					/>
				</tbody>
			</table>
		);

		const row = screen.getByText('HumanReadableModId').closest('tr') as HTMLTableRowElement;
		fireEvent.click(row);

		expect(onOpenDetails).toHaveBeenCalledWith(record);
		expect(onRowHighlight).not.toHaveBeenCalled();
	});
});

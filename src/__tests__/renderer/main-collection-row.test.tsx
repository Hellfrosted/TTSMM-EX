import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplayModData, ModType } from '../../model';
import { MainCollectionVirtualRow } from '../../renderer/components/collections/main-collection-row';

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
	it('renders selection and cell presentation for a virtual row', () => {
		const onSelectedChange = vi.fn();
		const onContextMenu = vi.fn();
		const onOpenDetails = vi.fn();
		const onRowHighlight = vi.fn();
		const record = createRecord({ dateAdded: new Date(2026, 3, 12, 9, 30) });

		render(
			<table>
				<tbody>
					<MainCollectionVirtualRow
						columns={[
							{ title: 'ID', dataIndex: 'id', width: 140 },
							{ title: 'Date Added', dataIndex: 'dateAdded' },
							{ title: 'Name', dataIndex: 'name', render: (value) => `Mod name: ${value}` }
						]}
						highlighted={true}
						record={record}
						rowHeight={48}
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

		expect(screen.getByRole('cell', { name: '2026-04-12 09:30' })).toBeInTheDocument();
		expect(screen.getByRole('cell', { name: 'Mod name: HHI Custom Paint GT' })).toBeInTheDocument();
		expect(onSelectedChange).toHaveBeenCalledWith(record, false);
		expect(onContextMenu).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('row', { name: /Mod row for HumanReadableModId/ })).toHaveStyle({ height: '48px' });
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
						record={record}
						rowHeight={48}
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
		expect(row).toHaveAttribute('aria-keyshortcuts', 'Enter Space ArrowUp ArrowDown Home End');
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
						record={record}
						rowHeight={48}
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

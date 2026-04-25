import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainCollectionView } from '../../renderer/components/collections/MainCollectionComponent';
import { resetColumnMeasurementCache } from '../../renderer/components/collections/main-collection-table-layout';
import { CollectionViewProps, MainColumnTitles, ModType } from '../../model';

afterEach(() => {
	cleanup();
	resetColumnMeasurementCache();
	vi.unstubAllGlobals();
});

function stubResizeObserver() {
	const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
		return {
			observe: vi.fn(),
			unobserve: vi.fn(),
			disconnect: vi.fn()
		};
	});
	vi.stubGlobal('ResizeObserver', ResizeObserverMock);
}

async function findResizeHandles(columnTitle: string) {
	return screen.findAllByRole('slider', { name: `Resize ${columnTitle}` });
}

function clickHeaderSort(columnTitle: string) {
	fireEvent.click(screen.getAllByText(columnTitle)[0]);
}

function getResizeValue(columnTitle: string) {
	const [resizeHandle] = screen.getAllByRole('slider', { name: `Resize ${columnTitle}` });
	return Number.parseInt(resizeHandle.getAttribute('aria-valuenow') || '0', 10);
}

function getRenderedNameOrder() {
	return screen
		.getAllByRole('button', { name: /^Open details for / })
		.map((button) => button.getAttribute('aria-label')?.replace('Open details for ', '') || '');
}

function createDataTransfer() {
	const data = new Map<string, string>();
	return {
		effectAllowed: '',
		dropEffect: '',
		setData: vi.fn((type: string, value: string) => {
			data.set(type, value);
		}),
		getData: vi.fn((type: string) => data.get(type) || '')
	};
}

function createProps(overrides: Partial<CollectionViewProps> = {}): CollectionViewProps {
	const rows = [
		{
			uid: 'workshop:3264187221',
			type: ModType.WORKSHOP,
			workshopID: BigInt(3264187221),
			id: 'HumanReadableModId',
			name: 'HHI Custom Paint GT',
			subscribed: true,
			installed: true
		}
	];

	return {
		rows,
		filteredRows: rows,
		collection: { name: 'default', mods: [rows[0].uid] },
		config: {},
		setEnabledModsCallback: vi.fn(),
		setEnabledCallback: vi.fn(),
		setDisabledCallback: vi.fn(),
		setMainColumnWidthCallback: vi.fn(),
		getModDetails: vi.fn(),
		...overrides
	};
}

function createRows(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		uid: `workshop:${index + 1}`,
		type: ModType.WORKSHOP,
		workshopID: BigInt(index + 1),
		id: `Mod${index + 1}`,
		name: `Mod ${index + 1}`,
		subscribed: true,
		installed: true
	}));
}

describe('MainCollectionView', () => {
	it('shows the mod id in the Name column and the workshop id in the ID column', async () => {
		stubResizeObserver();

		render(<MainCollectionView {...createProps()} />);

		expect(await screen.findByText('3264187221')).toBeInTheDocument();
		expect(screen.getByText('HumanReadableModId')).toBeInTheDocument();
	});

	it('labels the row details trigger and type indicator for accessibility', async () => {
		stubResizeObserver();

		render(<MainCollectionView {...createProps()} />);

		expect(await screen.findByRole('button', { name: 'Open details for HumanReadableModId' })).toBeInTheDocument();
		expect(screen.getByAltText('Steam Workshop mod')).toBeInTheDocument();
		const [resizeHandle] = await findResizeHandles('ID');
		expect(resizeHandle).toHaveAttribute('role', 'slider');
		expect(resizeHandle).toHaveAttribute('aria-orientation', 'horizontal');
	});

	it('labels row selection checkboxes by mod name for accessibility', async () => {
		stubResizeObserver();

		render(<MainCollectionView {...createProps()} />);

		expect(await screen.findByRole('checkbox', { name: 'Include HumanReadableModId in collection' })).toBeChecked();
	});

	it('defaults to name sorting and supports size and date added sorting without an unsorted state', async () => {
		stubResizeObserver();

		const rows = [
			{
				uid: 'workshop:3',
				type: ModType.WORKSHOP,
				workshopID: BigInt(3),
				id: 'Charlie',
				name: 'Charlie',
				size: 100,
				dateAdded: new Date('2026-04-12T00:00:00.000Z'),
				subscribed: true,
				installed: true
			},
			{
				uid: 'workshop:1',
				type: ModType.WORKSHOP,
				workshopID: BigInt(1),
				id: 'Alpha',
				name: 'Alpha',
				size: 300,
				dateAdded: new Date('2026-04-13T00:00:00.000Z'),
				subscribed: true,
				installed: true
			},
			{
				uid: 'workshop:2',
				type: ModType.WORKSHOP,
				workshopID: BigInt(2),
				id: 'Bravo',
				name: 'Bravo',
				size: 200,
				dateAdded: new Date('2026-04-11T00:00:00.000Z'),
				subscribed: true,
				installed: true
			}
		];

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: rows.map((row) => row.uid) }
				})}
			/>
		);

		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		clickHeaderSort('Size');
		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Charlie', 'Bravo', 'Alpha']);
		});

		clickHeaderSort('Size');
		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		clickHeaderSort('Size');
		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Charlie', 'Bravo', 'Alpha']);
		});

		clickHeaderSort('Date Added');
		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Bravo', 'Charlie', 'Alpha']);
		});
	});

	it('allows resizing a column and reports the persisted width', async () => {
		stubResizeObserver();

		const setMainColumnWidthCallback = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					setMainColumnWidthCallback
				})}
			/>
		);

		const resizeHandles = await findResizeHandles('ID');
		const initialWidth = getResizeValue('ID');
		resizeHandles.forEach((resizeHandle) => {
			fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
		});

		await waitFor(() => {
			expect(
				setMainColumnWidthCallback.mock.calls.some(
					([column, width]) => column === MainColumnTitles.ID && typeof width === 'number' && width > initialWidth
				)
			).toBe(true);
		});
	});

	it('updates the column preview during mouse drag without persisting on mousemove', async () => {
		stubResizeObserver();

		const setMainColumnWidthCallback = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					setMainColumnWidthCallback
				})}
			/>
		);

		const [resizeHandle] = await findResizeHandles('ID');
		const initialWidth = getResizeValue('ID');

		fireEvent.mouseDown(resizeHandle, { clientX: 200 });
		fireEvent.mouseMove(window, { clientX: 236 });

		expect(setMainColumnWidthCallback).not.toHaveBeenCalled();
		expect(getResizeValue('ID')).toBeGreaterThan(initialWidth);

		fireEvent.mouseUp(window);
	});

	it('offers column options that can hide the current column and restore hidden columns', async () => {
		stubResizeObserver();

		const setMainColumnVisibilityCallback = vi.fn();
		const { rerender } = render(
			<MainCollectionView
				{...createProps({
					setMainColumnVisibilityCallback
				})}
			/>
		);

		fireEvent.contextMenu(screen.getAllByText('Tags')[0]);
		fireEvent.click(await screen.findByText('Hide Tags'));

		expect(setMainColumnVisibilityCallback).toHaveBeenCalledWith(MainColumnTitles.TAGS, false);

		rerender(
			<MainCollectionView
				{...createProps({
					config: {
						columnActiveConfig: {
							[MainColumnTitles.TAGS]: false
						}
					},
					setMainColumnVisibilityCallback
				})}
			/>
		);

		fireEvent.contextMenu(screen.getAllByText('Name')[0]);
		fireEvent.click(await screen.findByText('Show Tags'));

		expect(setMainColumnVisibilityCallback).toHaveBeenCalledWith(MainColumnTitles.TAGS, true);
	});

	it('reorders columns by dragging collection table headers', async () => {
		stubResizeObserver();

		const setMainColumnOrderCallback = vi.fn();
		const { container } = render(
			<MainCollectionView
				{...createProps({
					setMainColumnOrderCallback
				})}
			/>
		);

		await screen.findByText('HumanReadableModId');
		const idHeader = container.querySelector('th[data-column-title="ID"]');
		const nameHeader = container.querySelector('th[data-column-title="Name"]');
		expect(idHeader).toBeDefined();
		expect(nameHeader).toBeDefined();

		const dataTransfer = createDataTransfer();
		fireEvent.dragStart(idHeader as Element, { dataTransfer });
		fireEvent.dragOver(nameHeader as Element, { dataTransfer });
		fireEvent.drop(nameHeader as Element, { dataTransfer });

		expect(setMainColumnOrderCallback).toHaveBeenCalledWith(MainColumnTitles.ID, MainColumnTitles.NAME);
	});

	it('auto-sizes from rendered cells and keeps the measured width when sampled rows are reordered', async () => {
		stubResizeObserver();

		const longDisplayName = 'Charlie Custom Paint With Long Searchable Workshop Identifier And Extra Width';
		const firstRows = [
			{
				uid: 'workshop:3',
				type: ModType.WORKSHOP,
				workshopID: BigInt(3),
				id: longDisplayName,
				name: longDisplayName,
				subscribed: true,
				installed: true
			},
			{
				uid: 'workshop:1',
				type: ModType.WORKSHOP,
				workshopID: BigInt(1),
				id: 'Alpha',
				name: 'Alpha',
				subscribed: true,
				installed: true
			},
			{
				uid: 'workshop:2',
				type: ModType.WORKSHOP,
				workshopID: BigInt(2),
				id: 'Bravo',
				name: 'Bravo',
				subscribed: true,
				installed: true
			}
		];

		const { rerender } = render(
			<MainCollectionView
				{...createProps({
					rows: firstRows,
					filteredRows: firstRows,
					collection: { name: 'default', mods: firstRows.map((row) => row.uid) }
				})}
			/>
		);

		await waitFor(() => {
			expect(getResizeValue('Name')).toBeGreaterThan(288);
		});
		const measuredNameWidth = getResizeValue('Name');

		const reorderedRows = [firstRows[1], firstRows[2], firstRows[0]];
		rerender(
			<MainCollectionView
				{...createProps({
					rows: reorderedRows,
					filteredRows: reorderedRows,
					collection: { name: 'default', mods: reorderedRows.map((row) => row.uid) }
				})}
			/>
		);

		await waitFor(() => {
			expect(getResizeValue('Name')).toBe(measuredNameWidth);
		});
	});

	it('keeps fallback widths for very large collections', async () => {
		stubResizeObserver();

		const rows = createRows(121).map((row, index) =>
			index === 0
				? {
						...row,
						id: 'Very Long Workshop Identifier That Would Need A Wider Name Column If Measured',
						name: 'Very Long Workshop Identifier That Would Need A Wider Name Column If Measured'
					}
				: row
		);

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: rows.map((row) => row.uid) }
				})}
			/>
		);

		await screen.findAllByRole('button', { name: /^Open details for / });
		await new Promise((resolve) => {
			window.setTimeout(resolve, 0);
		});

		expect(getResizeValue('Name')).toBe(288);
	});
});

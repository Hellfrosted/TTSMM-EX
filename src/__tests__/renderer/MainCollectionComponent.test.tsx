import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainCollectionView, getColumnWidths } from '../../renderer/components/collections/MainCollectionComponent';
import { CollectionViewProps, MainCollectionConfig, MainColumnTitles, ModType } from '../../model';

afterEach(() => {
	cleanup();
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

function getResizeHandles(columnTitle: string) {
	return Array.from(document.querySelectorAll('thead th'))
		.filter((header) => header.textContent?.trim() === columnTitle)
		.flatMap((header) => Array.from(header.querySelectorAll('.CollectionTableResizeHandle'))) as HTMLButtonElement[];
}

function clickHeaderSort(columnTitle: string) {
	const headerCell = Array.from(document.querySelectorAll('thead th')).find((header) => header.textContent?.trim() === columnTitle) as HTMLElement | undefined;
	expect(headerCell).toBeDefined();
	fireEvent.click(headerCell?.querySelector('.ant-table-column-sorters') || headerCell!);
}

function getHeaderCell(columnTitle: string) {
	return Array.from(document.querySelectorAll('thead th')).find((header) => header.textContent?.trim() === columnTitle) as HTMLElement | undefined;
}

function getRenderedNameOrder() {
	return Array.from(document.querySelectorAll('.CollectionNameButton')).map((button) => button.textContent?.trim() || '');
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
	it('uses the lower per-column minimums and gives unsaved extra width to Name instead of Tags', () => {
		const autoColumnWidths: Record<string, number> = {
			[MainColumnTitles.TYPE]: 65,
			[MainColumnTitles.NAME]: 300,
			[MainColumnTitles.AUTHORS]: 24,
			[MainColumnTitles.STATE]: 28,
			[MainColumnTitles.ID]: 20,
			[MainColumnTitles.SIZE]: 16,
			[MainColumnTitles.LAST_UPDATE]: 130,
			[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 130,
			[MainColumnTitles.DATE_ADDED]: 130,
			[MainColumnTitles.TAGS]: 200
		};

		const widths = getColumnWidths(undefined, autoColumnWidths, 1400);
		expect(widths[MainColumnTitles.AUTHORS]).toBe(40);
		expect(widths[MainColumnTitles.STATE]).toBe(40);
		expect(widths[MainColumnTitles.ID]).toBe(32);
		expect(widths[MainColumnTitles.SIZE]).toBe(32);
		expect(widths[MainColumnTitles.TAGS]).toBe(200);
		expect(widths[MainColumnTitles.NAME]).toBe(553);
	});

	it('does not override a saved Name width when filling the table', () => {
		const config: MainCollectionConfig = {
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 320
			}
		};
		const autoColumnWidths: Record<string, number> = {
			[MainColumnTitles.TYPE]: 65,
			[MainColumnTitles.NAME]: 300,
			[MainColumnTitles.AUTHORS]: 64,
			[MainColumnTitles.STATE]: 64,
			[MainColumnTitles.ID]: 52,
			[MainColumnTitles.SIZE]: 52,
			[MainColumnTitles.LAST_UPDATE]: 130,
			[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 130,
			[MainColumnTitles.DATE_ADDED]: 130,
			[MainColumnTitles.TAGS]: 200
		};

		const widths = getColumnWidths(config, autoColumnWidths, 1400);
		expect(widths[MainColumnTitles.NAME]).toBe(320);
	});

	it('uses tighter fallback widths when auto measurement is unavailable', () => {
		const widths = getColumnWidths(undefined, {}, 0);

		expect(widths[MainColumnTitles.TYPE]).toBe(56);
		expect(widths[MainColumnTitles.NAME]).toBe(288);
		expect(widths[MainColumnTitles.AUTHORS]).toBe(120);
		expect(widths[MainColumnTitles.STATE]).toBe(112);
		expect(widths[MainColumnTitles.ID]).toBe(132);
		expect(widths[MainColumnTitles.SIZE]).toBe(72);
		expect(widths[MainColumnTitles.LAST_UPDATE]).toBe(116);
		expect(widths[MainColumnTitles.LAST_WORKSHOP_UPDATE]).toBe(116);
		expect(widths[MainColumnTitles.DATE_ADDED]).toBe(116);
		expect(widths[MainColumnTitles.TAGS]).toBe(180);
	});

	it('drops low-priority columns first when the available table width is narrow', () => {
		const autoColumnWidths: Record<string, number> = {
			[MainColumnTitles.TYPE]: 65,
			[MainColumnTitles.NAME]: 300,
			[MainColumnTitles.AUTHORS]: 80,
			[MainColumnTitles.STATE]: 120,
			[MainColumnTitles.ID]: 52,
			[MainColumnTitles.SIZE]: 52,
			[MainColumnTitles.LAST_UPDATE]: 130,
			[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 130,
			[MainColumnTitles.DATE_ADDED]: 130,
			[MainColumnTitles.TAGS]: 200
		};

		const widths = getColumnWidths(undefined, autoColumnWidths, 900);

		expect(widths[MainColumnTitles.TYPE]).toBe(65);
		expect(widths[MainColumnTitles.NAME]).toBeGreaterThanOrEqual(300);
		expect(widths[MainColumnTitles.AUTHORS]).toBe(80);
		expect(widths[MainColumnTitles.STATE]).toBe(120);
		expect(widths[MainColumnTitles.ID]).toBe(52);
		expect(widths[MainColumnTitles.SIZE]).toBeUndefined();
		expect(widths[MainColumnTitles.LAST_UPDATE]).toBeUndefined();
		expect(widths[MainColumnTitles.LAST_WORKSHOP_UPDATE]).toBeUndefined();
		expect(widths[MainColumnTitles.DATE_ADDED]).toBeUndefined();
		expect(widths[MainColumnTitles.TAGS]).toBeUndefined();
	});

	it('shows the mod id in the Name column and the workshop id in the ID column', async () => {
		stubResizeObserver();

		render(<MainCollectionView {...createProps()} />);

		expect(await screen.findByText('3264187221')).toBeInTheDocument();
		expect(screen.getByText('HumanReadableModId')).toBeInTheDocument();
	});

	it('labels the row details trigger and type indicator for accessibility', async () => {
		stubResizeObserver();

		render(<MainCollectionView {...createProps()} />);

		await waitFor(() => {
			expect(document.querySelector('.CollectionNameButton')).not.toBeNull();
		});
		const nameButton = document.querySelector('.CollectionNameButton');
		expect(nameButton).not.toBeNull();
		expect(nameButton).toHaveAttribute('aria-label', 'Open details for HumanReadableModId');
		expect(screen.getByAltText('Steam Workshop mod')).toBeInTheDocument();
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

		await waitFor(() => {
			expect(getResizeHandles('ID').length).toBeGreaterThan(0);
		});
		const tableRoot = document.querySelector('.MainCollectionTableRoot');
		const initialWidth = Number.parseInt(tableRoot?.style.getPropertyValue('--main-collection-column-width-id') || '0', 10);
		const resizeHandles = getResizeHandles('ID');
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

		await waitFor(() => {
			expect(getResizeHandles('ID').length).toBeGreaterThan(0);
		});
		const [resizeHandle] = getResizeHandles('ID');
		const tableRoot = document.querySelector('.MainCollectionTableRoot');

		expect(resizeHandle).toBeDefined();
		expect(tableRoot).not.toBeNull();
		const initialWidth = Number.parseInt(tableRoot?.style.getPropertyValue('--main-collection-column-width-id') || '0', 10);

		fireEvent.mouseDown(resizeHandle, { clientX: 200 });
		fireEvent.mouseMove(window, { clientX: 236 });

		expect(setMainColumnWidthCallback).not.toHaveBeenCalled();
		const previewWidth = Number.parseInt(tableRoot?.style.getPropertyValue('--main-collection-column-width-id') || '0', 10);
		expect(previewWidth).toBeGreaterThan(initialWidth);

		fireEvent.mouseUp(window);
	});

	it('offers a header context menu that can hide the current column and restore hidden columns', async () => {
		stubResizeObserver();

		const setMainColumnVisibilityCallback = vi.fn();
		const { rerender } = render(
			<MainCollectionView
				{...createProps({
					setMainColumnVisibilityCallback
				})}
			/>
		);

		await waitFor(() => {
			expect(getHeaderCell('Tags')).toBeDefined();
		});
		const tagsHeader = getHeaderCell('Tags');
		expect(tagsHeader).toBeDefined();
		fireEvent.contextMenu(tagsHeader?.querySelector('.CollectionTableHeaderContextTarget') || tagsHeader!);
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

		await waitFor(() => {
			expect(getHeaderCell('Name')).toBeDefined();
		});
		const nameHeader = getHeaderCell('Name');
		expect(nameHeader).toBeDefined();
		fireEvent.contextMenu(nameHeader?.querySelector('.CollectionTableHeaderContextTarget') || nameHeader!);
		fireEvent.click(await screen.findByText('Show Tags'));

		expect(setMainColumnVisibilityCallback).toHaveBeenCalledWith(MainColumnTitles.TAGS, true);
	});

	it('does not rerun offscreen measurement when the same sampled rows are only reordered', async () => {
		stubResizeObserver();

		const firstRows = [
			{
				uid: 'workshop:3',
				type: ModType.WORKSHOP,
				workshopID: BigInt(3),
				id: 'Charlie',
				name: 'Charlie',
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
		const appendSpy = vi.spyOn(document.body, 'appendChild');
		const countMeasurementHosts = () =>
			appendSpy.mock.calls.filter(
				([node]) => node instanceof HTMLElement && node.className === 'MainCollectionTableMeasureHost'
			).length;

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
			expect(countMeasurementHosts()).toBeGreaterThan(0);
		});

		const initialMeasurementCount = countMeasurementHosts();
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
			expect(screen.getByText('Bravo')).toBeInTheDocument();
		});

		expect(countMeasurementHosts()).toBe(initialMeasurementCount);
		appendSpy.mockRestore();
	});

	it('skips offscreen width measurement for very large collections', async () => {
		stubResizeObserver();

		const rows = createRows(121);
		const appendSpy = vi.spyOn(document.body, 'appendChild');
		const countMeasurementHosts = () =>
			appendSpy.mock.calls.filter(
				([node]) => node instanceof HTMLElement && node.className === 'MainCollectionTableMeasureHost'
			).length;

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
			expect(document.querySelectorAll('.CollectionNameButton').length).toBeGreaterThan(0);
		});

		expect(countMeasurementHosts()).toBe(0);
		appendSpy.mockRestore();
	});
});

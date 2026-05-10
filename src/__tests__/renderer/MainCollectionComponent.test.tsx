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

	it('routes row actions through the table command object', async () => {
		stubResizeObserver();
		const setDisabled = vi.fn();
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					getModDetails: undefined,
					setDisabledCallback: undefined,
					setEnabledCallback: undefined,
					setEnabledModsCallback: undefined,
					tableCommands: {
						getModDetails,
						setDisabled,
						setEnabled: vi.fn(),
						setEnabledMods: vi.fn()
					}
				})}
			/>
		);

		const detailsButton = await screen.findByRole('button', { name: 'Open details for HumanReadableModId' });
		fireEvent.click(detailsButton);
		fireEvent.click(screen.getByRole('checkbox', { name: 'Include HumanReadableModId in collection' }));
		const row = screen.getByText('3264187221').closest('tr') as HTMLTableRowElement;
		fireEvent.click(row);
		fireEvent.doubleClick(row);

		expect(getModDetails).toHaveBeenCalledWith('workshop:3264187221', expect.objectContaining({ uid: 'workshop:3264187221' }));
		expect(setDisabled).toHaveBeenCalledWith('workshop:3264187221');
		expect(setDisabled).toHaveBeenCalledTimes(1);
		expect(row).toHaveAttribute('aria-selected', 'true');
	});

	it('moves the active details row with arrow keys without changing collection inclusion', async () => {
		stubResizeObserver();
		const rows = createRows(3);
		const getModDetails = vi.fn();
		const setEnabled = vi.fn();
		const setDisabled = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: true,
					getModDetails,
					setEnabledCallback: setEnabled,
					setDisabledCallback: setDisabled
				})}
			/>
		);

		await screen.findByText('Mod2');
		const firstRow = screen.getByText('Mod1').closest('tr');
		const secondRow = screen.getByText('Mod2').closest('tr');
		expect(firstRow).not.toBeNull();
		expect(secondRow).not.toBeNull();

		const firstDetailsButton = screen.getByRole('button', { name: 'Open details for Mod1' });
		fireEvent.click(firstDetailsButton);
		firstDetailsButton.focus();
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		fireEvent.scroll(scrollPane);
		expect(scrollPane).toHaveFocus();
		fireEvent.keyDown(scrollPane, { key: 'ArrowDown' });

		expect(getModDetails).toHaveBeenLastCalledWith(rows[1].uid, expect.objectContaining({ uid: rows[1].uid }));
		expect(secondRow).toHaveAttribute('aria-selected', 'true');
		expect(setEnabled).not.toHaveBeenCalled();
		expect(setDisabled).not.toHaveBeenCalled();
		expect(screen.getByRole('checkbox', { name: 'Include Mod1 in collection' })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: 'Include Mod2 in collection' })).not.toBeChecked();
	});

	it('does not reactivate stale mod name buttons with Space after manual scrolling', async () => {
		stubResizeObserver();
		const rows = createRows(2);
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: true,
					getModDetails
				})}
			/>
		);

		await screen.findByText('Mod2');
		const firstDetailsButton = screen.getByRole('button', { name: 'Open details for Mod1' });
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		fireEvent.click(firstDetailsButton);
		firstDetailsButton.focus();
		expect(getModDetails).toHaveBeenCalledWith(rows[0].uid, expect.objectContaining({ uid: rows[0].uid }));
		getModDetails.mockClear();

		fireEvent.scroll(scrollPane);
		expect(scrollPane).toHaveFocus();
		fireEvent.keyDown(scrollPane, { key: ' ' });

		expect(getModDetails).not.toHaveBeenCalled();
	});

	it.each(['Enter', ' '])('opens the highlighted mod details with %s from the scrolled table focus', async (key) => {
		stubResizeObserver();
		const rows = createRows(2);
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: false,
					getModDetails
				})}
			/>
		);

		await screen.findByText('Mod2');
		const firstDetailsButton = screen.getByRole('button', { name: 'Open details for Mod1' });
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		fireEvent.click(firstDetailsButton);
		firstDetailsButton.focus();
		fireEvent.scroll(scrollPane);
		expect(scrollPane).toHaveFocus();

		fireEvent.keyDown(scrollPane, { key });

		expect(getModDetails).toHaveBeenCalledWith(rows[0].uid, expect.objectContaining({ uid: rows[0].uid }));
	});

	it('ignores non-navigation keys on an initially unhighlighted mod row', async () => {
		stubResizeObserver();
		const rows = createRows(2);
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: false,
					getModDetails
				})}
			/>
		);

		await screen.findByText('Mod2');
		const firstDetailsButton = screen.getByRole('button', { name: 'Open details for Mod1' });
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		firstDetailsButton.focus();

		fireEvent.keyDown(firstDetailsButton, { key: 'Tab' });

		expect(scrollPane).not.toHaveFocus();
		expect(getModDetails).not.toHaveBeenCalled();
		expect(screen.getByText('Mod1').closest('tr')).toHaveAttribute('aria-selected', 'false');
	});

	it('moves focus to the table pane after arrowing between visible mod rows', async () => {
		stubResizeObserver();
		const rows = createRows(2);
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: false,
					getModDetails
				})}
			/>
		);

		await screen.findByText('Mod2');
		const firstDetailsButton = screen.getByRole('button', { name: 'Open details for Mod1' });
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		fireEvent.click(firstDetailsButton);
		firstDetailsButton.focus();

		fireEvent.keyDown(firstDetailsButton, { key: 'ArrowDown' });
		expect(scrollPane).toHaveFocus();
		fireEvent.keyDown(scrollPane, { key: 'Enter' });

		expect(getModDetails).toHaveBeenCalledWith(rows[1].uid, expect.objectContaining({ uid: rows[1].uid }));
	});

	it('navigates from the focused mod row before any row is highlighted', async () => {
		stubResizeObserver();
		const rows = createRows(3);

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: false
				})}
			/>
		);

		await screen.findByText('Mod3');
		const secondDetailsButton = screen.getByRole('button', { name: 'Open details for Mod2' });
		const thirdRow = screen.getByText('Mod3').closest('tr');
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		secondDetailsButton.focus();

		fireEvent.keyDown(secondDetailsButton, { key: 'ArrowDown' });

		expect(scrollPane).toHaveFocus();
		expect(thirdRow).toHaveAttribute('aria-selected', 'true');
	});

	it('keeps the details panel open when arrow navigation is clamped at the list boundary', async () => {
		stubResizeObserver();
		const rows = createRows(2);
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: true,
					getModDetails
				})}
			/>
		);

		await screen.findByText('Mod2');
		const lastDetailsButton = screen.getByRole('button', { name: 'Open details for Mod2' });
		const scrollPane = document.querySelector('.MainCollectionVirtualScroll') as HTMLDivElement;
		fireEvent.click(lastDetailsButton);
		lastDetailsButton.focus();
		fireEvent.scroll(scrollPane);
		getModDetails.mockClear();

		fireEvent.keyDown(scrollPane, { key: 'ArrowDown' });

		expect(getModDetails).not.toHaveBeenCalled();
		expect(screen.getByText('Mod2').closest('tr')).toHaveAttribute('aria-selected', 'true');
	});

	it('does not navigate mod rows from focused collection inclusion checkboxes', async () => {
		stubResizeObserver();
		const rows = createRows(2);
		const getModDetails = vi.fn();
		const setEnabled = vi.fn();
		const setDisabled = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: [rows[0].uid] },
					detailsOpen: true,
					getModDetails,
					setEnabledCallback: setEnabled,
					setDisabledCallback: setDisabled
				})}
			/>
		);

		await screen.findByText('Mod2');
		const firstCheckbox = screen.getByRole('checkbox', { name: 'Include Mod1 in collection' });
		fireEvent.keyDown(firstCheckbox, { key: 'ArrowDown' });

		expect(getModDetails).not.toHaveBeenCalled();
		expect(screen.getByText('Mod2').closest('tr')).toHaveAttribute('aria-selected', 'false');
	});

	it('opens row details when the highlighted row details icon is clicked', async () => {
		stubResizeObserver();
		const getModDetails = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					getModDetails: undefined,
					tableCommands: {
						getModDetails,
						setDisabled: vi.fn(),
						setEnabled: vi.fn(),
						setEnabledMods: vi.fn()
					}
				})}
			/>
		);

		const detailsButton = await screen.findByRole('button', { name: 'Open details for HumanReadableModId' });
		fireEvent.click(detailsButton);
		expect(getModDetails).not.toHaveBeenCalled();

		const detailsHint = await screen.findByTitle('Open mod details');
		fireEvent.click(detailsHint);

		expect(getModDetails).toHaveBeenCalledWith('workshop:3264187221', expect.objectContaining({ uid: 'workshop:3264187221' }));
	});

	it('switches visible mod details when another mod is clicked', async () => {
		stubResizeObserver();
		const getModDetails = vi.fn();
		const rows = [
			{
				uid: 'workshop:3264187221',
				type: ModType.WORKSHOP,
				workshopID: BigInt(3264187221),
				id: 'HumanReadableModId',
				name: 'HHI Custom Paint GT',
				subscribed: true,
				installed: true
			},
			{
				uid: 'workshop:2',
				type: ModType.WORKSHOP,
				workshopID: BigInt(2),
				id: 'SecondMod',
				name: 'Second Mod',
				subscribed: true,
				installed: true
			}
		];

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					detailsOpen: true,
					getModDetails: undefined,
					tableCommands: {
						getModDetails,
						setDisabled: vi.fn(),
						setEnabled: vi.fn(),
						setEnabledMods: vi.fn()
					}
				})}
			/>
		);

		fireEvent.click(await screen.findByRole('button', { name: 'Open details for HumanReadableModId' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Open details for SecondMod' }));

		expect(getModDetails).toHaveBeenNthCalledWith(1, 'workshop:3264187221', expect.objectContaining({ uid: 'workshop:3264187221' }));
		expect(getModDetails).toHaveBeenNthCalledWith(2, 'workshop:2', expect.objectContaining({ uid: 'workshop:2' }));
		expect(getModDetails).toHaveBeenCalledWith('workshop:2', expect.objectContaining({ uid: 'workshop:2' }));
	});

	it('defaults to name sorting and supports type, tags, size, and date added sorting without an unsorted state', async () => {
		stubResizeObserver();

		const rows = [
			{
				uid: 'workshop:3',
				type: ModType.WORKSHOP,
				workshopID: BigInt(3),
				id: 'Charlie',
				name: 'Charlie',
				size: 100,
				tags: ['Blocks'],
				dateAdded: new Date('2026-04-12T00:00:00.000Z'),
				subscribed: true,
				installed: true
			},
			{
				uid: 'local:alpha',
				type: ModType.LOCAL,
				id: 'Alpha',
				name: 'Alpha',
				size: 300,
				tags: ['bf'],
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
				tags: ['GeoCorp'],
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

		clickHeaderSort('Type');
		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		clickHeaderSort('Tags');
		await waitFor(() => {
			expect(getRenderedNameOrder()).toEqual(['Alpha', 'Charlie', 'Bravo']);
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

	it('renders tag filtering from the Tags column header', async () => {
		stubResizeObserver();
		const onSelectedTagsChange = vi.fn();
		const rows = [
			{
				uid: 'workshop:1',
				type: ModType.WORKSHOP,
				workshopID: BigInt(1),
				id: 'Alpha',
				name: 'Alpha',
				tags: ['Better Future'],
				subscribed: true,
				installed: true
			}
		];

		render(
			<MainCollectionView
				{...createProps({
					rows,
					filteredRows: rows,
					collection: { name: 'default', mods: rows.map((row) => row.uid) },
					availableTags: ['Better Future', 'GeoCorp'],
					selectedTags: ['Better Future'],
					onSelectedTagsChange
				})}
			/>
		);

		expect(screen.queryByRole('combobox', { name: 'Filter mods by tag' })).not.toBeInTheDocument();
		const tagFilter = await screen.findByRole('combobox', { name: 'Filter Tags column' });
		expect(tagFilter).toBeInTheDocument();

		fireEvent.change(tagFilter, { target: { value: 'add:GeoCorp' } });
		expect(onSelectedTagsChange).toHaveBeenCalledWith(['Better Future', 'GeoCorp']);

		fireEvent.change(tagFilter, { target: { value: 'remove:Better Future' } });
		expect(onSelectedTagsChange).toHaveBeenCalledWith([]);
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

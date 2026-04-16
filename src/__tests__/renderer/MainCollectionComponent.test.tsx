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

	it('shows the mod id in the Name column and the workshop id in the ID column', async () => {
		stubResizeObserver();

		render(<MainCollectionView {...createProps()} />);

		expect(await screen.findByText('3264187221')).toBeInTheDocument();
		expect(screen.getByText('HumanReadableModId')).toBeInTheDocument();
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
		const resizeHandles = getResizeHandles('ID');
		resizeHandles.forEach((resizeHandle) => {
			fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
		});

		await waitFor(() => {
			expect(
				setMainColumnWidthCallback.mock.calls.some(
					([column, width]) => column === MainColumnTitles.ID && typeof width === 'number' && width >= 186
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

		fireEvent.mouseDown(resizeHandle, { clientX: 200 });
		fireEvent.mouseMove(window, { clientX: 236 });

		expect(setMainColumnWidthCallback).not.toHaveBeenCalled();
		expect(tableRoot?.style.getPropertyValue('--main-collection-column-width-id')).toBe('206px');

		fireEvent.mouseUp(window);
	});
});

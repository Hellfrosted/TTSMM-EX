import React from 'react';
import { App as AntApp } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockLookupColumnTitles, ModType, SessionMods, setupDescriptors } from '../../model';
import { BlockLookupView, getResponsiveBlockLookupColumns } from '../../renderer/views/BlockLookupView';
import type { BlockLookupRecord } from '../../shared/block-lookup';
import { createAppState } from './test-utils';

const TEST_STATS = {
	sources: 1,
	scanned: 1,
	skipped: 0,
	removed: 0,
	blocks: 1,
	updatedBlocks: 1,
	builtAt: new Date(0).toISOString()
};

const TEST_RECORD: BlockLookupRecord = {
	blockName: 'Alpha Cannon',
	internalName: 'TestCannon',
	blockId: '42',
	modTitle: 'Test Blocks',
	workshopId: '12345',
	sourceKind: 'json',
	sourcePath: 'C:\\Steam\\steamapps\\workshop\\content\\285920\\12345\\BlockJSON\\TestCannon.json',
	preferredAlias: 'Alpha_Cannon(Test_Blocks)',
	fallbackAlias: 'Alpha_Cannon(Test_Blocks)',
	spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)',
	fallbackSpawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
};

function createBlockLookupRecord(index: number, overrides: Partial<BlockLookupRecord> = {}): BlockLookupRecord {
	return {
		blockName: `Block ${index.toString().padStart(3, '0')}`,
		internalName: `TestBlock${index}`,
		blockId: index.toString(),
		modTitle: 'Test Blocks',
		workshopId: '12345',
		sourceKind: 'json',
		sourcePath: `C:\\Steam\\steamapps\\workshop\\content\\285920\\12345\\BlockJSON\\TestBlock${index}.json`,
		preferredAlias: `Block_${index}(Test_Blocks)`,
		fallbackAlias: `Block_${index}(Test_Blocks)`,
		spawnCommand: `SpawnBlock Block_${index}(Test_Blocks)`,
		fallbackSpawnCommand: `SpawnBlock Block_${index}(Test_Blocks)`,
		...overrides
	};
}

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

function renderBlockLookupView() {
	const mods = new SessionMods('', [
		{
			uid: 'workshop:12345',
			type: ModType.WORKSHOP,
			workshopID: BigInt(12345),
			id: 'TestBlocks',
			name: 'Test Blocks',
			path: 'C:\\Steam\\steamapps\\workshop\\content\\285920\\12345'
		}
	]);
	const appState = createAppState({ mods });
	setupDescriptors(mods, appState.config.userOverrides);

	return {
		appState,
		...render(
			<AntApp>
				<BlockLookupView appState={appState} />
			</AntApp>
		)
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BlockLookupView', () => {
	it('keeps Block Lookup columns within constrained desktop widths', () => {
		const responsiveColumns = getResponsiveBlockLookupColumns(
			[
				{ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, visible: true, width: 360, minWidth: 180 },
				{ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, visible: true, width: 220, minWidth: 120 },
				{ key: 'modTitle', title: BlockLookupColumnTitles.MOD, visible: true, width: 200, minWidth: 120 },
				{ key: 'blockId', title: BlockLookupColumnTitles.BLOCK_ID, visible: true, width: 110, minWidth: 90 },
				{ key: 'sourceKind', title: BlockLookupColumnTitles.SOURCE, visible: true, width: 130, minWidth: 90 }
			],
			640
		);

		expect(responsiveColumns.map((column) => column.key)).toEqual(['spawnCommand', 'blockName', 'modTitle', 'blockId']);
		expect(responsiveColumns.reduce((totalWidth, column) => totalWidth + column.width, 72)).toBeLessThanOrEqual(640);
	});

	it('searches indexed block aliases and copies the selected command', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({ workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920' });
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		expect((await screen.findAllByText('SpawnBlock Alpha_Cannon(Test_Blocks)')).length).toBeGreaterThan(0);
		fireEvent.click(screen.getByRole('button', { name: /Copy Selected/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Alpha_Cannon(Test_Blocks)');
		});
	});

	it('builds the index from the configured workshop root and loaded mods', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({ workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920' });
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(null);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [], stats: null });
		vi.mocked(window.electron.buildBlockLookupIndex).mockResolvedValue({
			settings: { workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920' },
			stats: TEST_STATS
		});

		renderBlockLookupView();

		await screen.findByRole('button', { name: /Update Index/ });
		fireEvent.click(screen.getByRole('button', { name: /Update Index/ }));

		await waitFor(() => {
			expect(window.electron.buildBlockLookupIndex).toHaveBeenCalledWith(
				expect.objectContaining({
					workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920',
					gameExec: expect.any(String),
					forceRebuild: false,
					modSources: [
						expect.objectContaining({
							uid: 'workshop:12345',
							name: 'Test Blocks',
							path: 'C:\\Steam\\steamapps\\workshop\\content\\285920\\12345',
							workshopID: '12345'
						})
					]
				})
			);
		});
	});

	it('shows block lookup results on one sortable page', async () => {
		stubResizeObserver();
		const records = Array.from({ length: 125 }, (_value, index) => createBlockLookupRecord(index + 1));
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({ workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920' });
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });

		renderBlockLookupView();

		await screen.findByText('Block 125');
		expect(screen.getByText('125 indexed blocks from 1 source')).toBeInTheDocument();
		expect(screen.queryByTitle('Next Page')).toBeNull();
	});

	it('sorts rows without canceling and reorders columns from table headers', async () => {
		stubResizeObserver();
		const records = [
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' }),
			createBlockLookupRecord(1, { blockName: 'Alpha Cannon', spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)', blockId: '' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({ workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920' });
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });

		const { appState, container } = renderBlockLookupView();

		await screen.findAllByText('Beta Shield');
		const table = container.querySelector('.BlockLookupTable');
		const initialTableText = table?.textContent ?? '';
		expect(initialTableText.indexOf('Beta Shield')).toBeLessThan(initialTableText.indexOf('Alpha Cannon'));

		const blockHeader = Array.from(container.querySelectorAll('.BlockLookupTable thead th')).find((header) => header.textContent?.trim() === 'Block');
		expect(blockHeader).toBeDefined();
		fireEvent.click(blockHeader as Element);

		await waitFor(() => {
			const tableText = table?.textContent ?? '';
			expect(tableText.indexOf('Alpha Cannon')).toBeGreaterThanOrEqual(0);
			expect(tableText.indexOf('Alpha Cannon')).toBeLessThan(tableText.indexOf('Beta Shield'));
		});
		fireEvent.click(blockHeader as Element);
		await waitFor(() => {
			const tableText = table?.textContent ?? '';
			expect(tableText.indexOf('Beta Shield')).toBeGreaterThanOrEqual(0);
			expect(tableText.indexOf('Beta Shield')).toBeLessThan(tableText.indexOf('Alpha Cannon'));
		});
		fireEvent.click(blockHeader as Element);
		await waitFor(() => {
			const tableText = table?.textContent ?? '';
			expect(tableText.indexOf('Alpha Cannon')).toBeGreaterThanOrEqual(0);
			expect(tableText.indexOf('Alpha Cannon')).toBeLessThan(tableText.indexOf('Beta Shield'));
		});
		expect(screen.getByText('Not declared')).toBeInTheDocument();

		const spawnHeader = Array.from(container.querySelectorAll('.BlockLookupTable thead th')).find((header) =>
			header.textContent?.includes('SpawnBlock Command')
		);
		expect(spawnHeader).toBeDefined();
		const tableHeaderDrag = createDataTransfer();
		fireEvent.dragStart(spawnHeader as Element, { dataTransfer: tableHeaderDrag });
		fireEvent.dragOver(blockHeader as Element, { dataTransfer: tableHeaderDrag });
		fireEvent.drop(blockHeader as Element, { dataTransfer: tableHeaderDrag });

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					viewConfigs: expect.objectContaining({
						blockLookup: expect.objectContaining({
							columnOrder: ['Block', 'SpawnBlock Command', 'Mod', 'Block ID', 'Source']
						})
					})
				})
			);
			expect(appState.updateState).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						viewConfigs: expect.objectContaining({
							blockLookup: expect.objectContaining({
								columnOrder: ['Block', 'SpawnBlock Command', 'Mod', 'Block ID', 'Source']
							})
						})
					})
				})
			);
		});
	});

	it('reorders table option rows by drag and drop', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({ workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920' });
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: 1 });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		const { appState } = renderBlockLookupView();

		await screen.findAllByText('Alpha Cannon');
		fireEvent.click(screen.getByRole('button', { name: /Table Options/ }));
		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).queryByRole('button', { name: /Move .* (left|right)/ })).toBeNull();
		const blockRow = within(dialog).getByText('Block').closest('.BlockLookupSettingsColumnRow');
		const spawnRow = within(dialog).getByText('SpawnBlock Command').closest('.BlockLookupSettingsColumnRow');
		expect(blockRow).toBeDefined();
		expect(spawnRow).toBeDefined();

		const modalDrag = createDataTransfer();
		fireEvent.dragStart(spawnRow as Element, { dataTransfer: modalDrag });
		fireEvent.dragOver(blockRow as Element, { dataTransfer: modalDrag });
		fireEvent.drop(blockRow as Element, { dataTransfer: modalDrag });
		fireEvent.click(screen.getByRole('button', { name: 'Save Table Settings' }));

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					viewConfigs: expect.objectContaining({
						blockLookup: expect.objectContaining({
							columnOrder: ['Block', 'SpawnBlock Command', 'Mod', 'Block ID', 'Source']
						})
					})
				})
			);
			expect(appState.updateState).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						viewConfigs: expect.objectContaining({
							blockLookup: expect.objectContaining({
								columnOrder: ['Block', 'SpawnBlock Command', 'Mod', 'Block ID', 'Source']
							})
						})
					})
				})
			);
		});
	});
});

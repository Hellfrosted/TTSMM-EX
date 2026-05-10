/// <reference path="../types/global.d.ts" />
/// <reference lib="es2022" />
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockLookupColumnTitles, ModType, SessionMods, setupDescriptors } from '../../model';
import { AppQueryProvider, queryClient } from '../../renderer/query-client';
import { getResponsiveBlockLookupColumns } from '../../renderer/views/block-lookup-table-layout';
import { BlockLookupView } from '../../renderer/views/BlockLookupView';
import type { BlockLookupRecord } from '../../shared/block-lookup';
import { createAppState } from './test-utils';

const TEST_STATS = {
	sources: 1,
	scanned: 1,
	skipped: 0,
	removed: 0,
	blocks: 1,
	updatedBlocks: 1,
	renderedPreviewsEnabled: false,
	renderedPreviews: 0,
	unavailablePreviews: 0,
	builtAt: new Date(0).toISOString()
};

const TEST_BLOCK_LOOKUP_SETTINGS = {
	workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920',
	renderedPreviewsEnabled: false
};

const TEST_RECORD: BlockLookupRecord = {
	blockName: 'Alpha Cannon',
	internalName: 'TestCannon',
	blockId: '42',
	modTitle: 'Test Blocks',
	workshopId: '12345',
	sourceKind: 'json',
	sourcePath: 'C:\\Steam\\steamapps\\workshop\\content\\285920\\12345\\BlockJSON\\TestCannon.json',
	previewBounds: { x: 3, y: 1, z: 1 },
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

function renderBlockLookupView(configOverrides: Parameters<typeof createAppState>[0] = {}) {
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
	const appState = createAppState({ mods, ...configOverrides });
	setupDescriptors(mods, appState.config.userOverrides);

	return {
		appState,
		...render(
			<div className="AppRoot">
				<AppQueryProvider>
					<BlockLookupView appState={appState} />
				</AppQueryProvider>
			</div>
		)
	};
}

afterEach(() => {
	cleanup();
	queryClient.clear();
	vi.unstubAllGlobals();
});

describe('BlockLookupView', () => {
	it('keeps Block Lookup columns within constrained desktop widths', () => {
		const responsiveColumns = getResponsiveBlockLookupColumns(
			[
				{ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, visible: true, width: 220, defaultWidth: 220, minWidth: 120 },
				{ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, visible: true, width: 360, defaultWidth: 360, minWidth: 180 },
				{ key: 'internalName', title: BlockLookupColumnTitles.INTERNAL_NAME, visible: true, width: 220, defaultWidth: 220, minWidth: 136 },
				{ key: 'modTitle', title: BlockLookupColumnTitles.MOD, visible: true, width: 200, defaultWidth: 200, minWidth: 120 },
				{ key: 'preview', title: BlockLookupColumnTitles.PREVIEW, visible: true, width: 92, defaultWidth: 92, minWidth: 76 }
			],
			560
		);

		expect(responsiveColumns.map((column) => column.key)).toEqual(['blockName', 'spawnCommand', 'internalName']);
		expect(responsiveColumns.reduce((totalWidth, column) => totalWidth + (column.width ?? column.defaultWidth), 32)).toBeLessThanOrEqual(
			560
		);
	});

	it('searches indexed block aliases and copies the selected command', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		expect((await screen.findAllByText('SpawnBlock Alpha_Cannon(Test_Blocks)')).length).toBeGreaterThan(0);
		expect(screen.queryByText('Preview')).not.toBeInTheDocument();
		expect(screen.queryByRole('img', { name: /Block preview/ })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /Copy Selected/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Alpha_Cannon(Test_Blocks)');
		});
	});

	it('asks for a rebuild when rendered previews are enabled against an index without preview support', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({
			...TEST_BLOCK_LOOKUP_SETTINGS,
			renderedPreviewsEnabled: true
		});
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		renderBlockLookupView();

		expect(await screen.findByText('Rebuild to generate previews')).toBeInTheDocument();
		expect(screen.queryByText('Preview')).not.toBeInTheDocument();
		expect(screen.queryByRole('img', { name: /Block preview/ })).not.toBeInTheDocument();
	});

	it('saves the rendered preview toggle immediately', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.saveBlockLookupSettings).mockResolvedValue({
			...TEST_BLOCK_LOOKUP_SETTINGS,
			renderedPreviewsEnabled: true
		});
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		renderBlockLookupView();

		const switchControl = await screen.findByRole('switch', { name: 'Enable rendered block previews' });
		fireEvent.click(switchControl);

		await waitFor(() => {
			expect(window.electron.saveBlockLookupSettings).toHaveBeenCalledWith({
				workshopRoot: TEST_BLOCK_LOOKUP_SETTINGS.workshopRoot,
				renderedPreviewsEnabled: true
			});
		});
		expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
	});

	it('shows only cached rendered preview references after the current index was built with rendered previews', async () => {
		stubResizeObserver();
		const previewRecord = {
			...TEST_RECORD,
			renderedPreview: {
				imageUrl: 'image://block-preview/alpha-cannon.png',
				width: 96,
				height: 64
			}
		};
		const previewStats = { ...TEST_STATS, renderedPreviewsEnabled: true, renderedPreviews: 1, unavailablePreviews: 0 };
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({
			...TEST_BLOCK_LOOKUP_SETTINGS,
			renderedPreviewsEnabled: true
		});
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(previewStats);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [previewRecord], stats: previewStats });

		renderBlockLookupView();

		expect(await screen.findByText('Preview')).toBeInTheDocument();
		expect(screen.queryByText('Rebuild to generate previews')).not.toBeInTheDocument();
		const previewImages = await screen.findAllByRole('img', { name: 'Alpha Cannon Block preview' });
		expect(previewImages).toHaveLength(2);
		expect(previewImages[0]).toHaveAttribute('src', 'image://block-preview/alpha-cannon.png');
	});

	it('selects block lookup rows with the keyboard and updates copy/detail state', async () => {
		stubResizeObserver();
		const records = [
			TEST_RECORD,
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		await screen.findAllByText('Beta Shield');
		expect(screen.queryByRole('img', { name: /Block preview/ })).not.toBeInTheDocument();
		const betaCell = screen.getAllByText('Beta Shield')[0];
		const betaRow = betaCell.closest('tr');
		expect(betaRow).not.toBeNull();
		betaRow!.focus();
		expect(betaRow).toHaveFocus();
		fireEvent.keyDown(betaRow!, { key: 'Enter' });

		expect(betaRow).toHaveAttribute('aria-selected', 'true');
		expect(screen.getAllByText('SpawnBlock Beta_Shield(Test_Blocks)').length).toBeGreaterThan(0);
		fireEvent.click(screen.getByRole('button', { name: /Copy Selected/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Beta_Shield(Test_Blocks)');
		});
	});

	it('moves block lookup selection with arrows and extends ranges with Shift+Arrow', async () => {
		stubResizeObserver();
		const records = [
			TEST_RECORD,
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' }),
			createBlockLookupRecord(3, { blockName: 'Gamma Wheel', spawnCommand: 'SpawnBlock Gamma_Wheel(Test_Blocks)' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		await screen.findAllByText('Gamma Wheel');
		const alphaRow = screen.getAllByText('Alpha Cannon')[0].closest('tr');
		const betaRow = screen.getAllByText('Beta Shield')[0].closest('tr');
		const gammaRow = screen.getAllByText('Gamma Wheel')[0].closest('tr');
		const scrollPane = document.querySelector('.BlockLookupVirtualScroll') as HTMLDivElement;
		expect(alphaRow).not.toBeNull();
		expect(betaRow).not.toBeNull();
		expect(gammaRow).not.toBeNull();

		alphaRow!.focus();
		fireEvent.keyDown(alphaRow!, { key: 'ArrowDown' });

		expect(scrollPane).toHaveFocus();
		expect(alphaRow).toHaveAttribute('aria-selected', 'false');
		expect(betaRow).toHaveAttribute('aria-selected', 'true');
		expect(gammaRow).toHaveAttribute('aria-selected', 'false');

		fireEvent.keyDown(scrollPane, { key: 'ArrowDown', shiftKey: true });
		fireEvent.click(screen.getByRole('button', { name: /Copy Selected/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Beta_Shield(Test_Blocks)\nSpawnBlock Gamma_Wheel(Test_Blocks)');
		});
		expect(betaRow).toHaveAttribute('aria-selected', 'true');
		expect(gammaRow).toHaveAttribute('aria-selected', 'true');
	});

	it('keeps block lookup keyboard focus stable across Home and End navigation', async () => {
		stubResizeObserver();
		const records = [
			TEST_RECORD,
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' }),
			createBlockLookupRecord(3, { blockName: 'Gamma Wheel', spawnCommand: 'SpawnBlock Gamma_Wheel(Test_Blocks)' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });

		renderBlockLookupView();

		await screen.findAllByText('Gamma Wheel');
		const alphaRow = screen.getAllByText('Alpha Cannon')[0].closest('tr');
		const betaRow = screen.getAllByText('Beta Shield')[0].closest('tr');
		const gammaRow = screen.getAllByText('Gamma Wheel')[0].closest('tr');
		const scrollPane = document.querySelector('.BlockLookupVirtualScroll') as HTMLDivElement;
		expect(alphaRow).not.toBeNull();
		expect(betaRow).not.toBeNull();
		expect(gammaRow).not.toBeNull();

		betaRow!.focus();
		fireEvent.keyDown(betaRow!, { key: 'End' });

		expect(scrollPane).toHaveFocus();
		expect(gammaRow).toHaveAttribute('aria-selected', 'true');

		fireEvent.keyDown(scrollPane, { key: 'Home' });

		expect(scrollPane).toHaveFocus();
		expect(alphaRow).toHaveAttribute('aria-selected', 'true');
	});

	it('copies selected block lookup rows with Ctrl+C in visible table order', async () => {
		stubResizeObserver();
		const records = [
			TEST_RECORD,
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' }),
			createBlockLookupRecord(3, { blockName: 'Gamma Wheel', spawnCommand: 'SpawnBlock Gamma_Wheel(Test_Blocks)' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		await screen.findAllByText('Gamma Wheel');
		const alphaRow = screen.getAllByText('Alpha Cannon')[0].closest('tr');
		const betaRow = screen.getAllByText('Beta Shield')[0].closest('tr');
		const gammaRow = screen.getAllByText('Gamma Wheel')[0].closest('tr');
		expect(alphaRow).not.toBeNull();
		expect(betaRow).not.toBeNull();
		expect(gammaRow).not.toBeNull();

		fireEvent.click(gammaRow!, { ctrlKey: true });
		fireEvent.keyDown(gammaRow!, { key: 'c', ctrlKey: true });

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Alpha_Cannon(Test_Blocks)\nSpawnBlock Gamma_Wheel(Test_Blocks)');
		});
		expect(betaRow).toHaveAttribute('aria-selected', 'false');
		expect(alphaRow).toHaveAttribute('aria-selected', 'true');
		expect(gammaRow).toHaveAttribute('aria-selected', 'true');
	});

	it('selects a block lookup row range with Shift+click', async () => {
		stubResizeObserver();
		const records = [
			TEST_RECORD,
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' }),
			createBlockLookupRecord(3, { blockName: 'Gamma Wheel', spawnCommand: 'SpawnBlock Gamma_Wheel(Test_Blocks)' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		await screen.findAllByText('Gamma Wheel');
		const betaRow = screen.getAllByText('Beta Shield')[0].closest('tr');
		const gammaRow = screen.getAllByText('Gamma Wheel')[0].closest('tr');
		expect(betaRow).not.toBeNull();
		expect(gammaRow).not.toBeNull();

		fireEvent.click(gammaRow!, { shiftKey: true });
		fireEvent.click(screen.getByRole('button', { name: /Copy Selected/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith(
				'SpawnBlock Alpha_Cannon(Test_Blocks)\nSpawnBlock Beta_Shield(Test_Blocks)\nSpawnBlock Gamma_Wheel(Test_Blocks)'
			);
		});
		expect(betaRow).toHaveAttribute('aria-selected', 'true');
		expect(gammaRow).toHaveAttribute('aria-selected', 'true');
	});

	it('selects all visible block lookup rows with Ctrl+A', async () => {
		stubResizeObserver();
		const records = [
			TEST_RECORD,
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		await screen.findAllByText('Beta Shield');
		const betaRow = screen.getAllByText('Beta Shield')[0].closest('tr');
		expect(betaRow).not.toBeNull();

		fireEvent.keyDown(betaRow!, { key: 'a', ctrlKey: true });
		fireEvent.keyDown(betaRow!, { key: 'c', ctrlKey: true });

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Alpha_Cannon(Test_Blocks)\nSpawnBlock Beta_Shield(Test_Blocks)');
		});
	});

	it('filters block lookup rows by mod from the Mod column header', async () => {
		stubResizeObserver();
		const records = [
			{ ...TEST_RECORD, modTitle: 'Alpha Pack', spawnCommand: 'SpawnBlock Alpha_Cannon(Alpha_Pack)' },
			createBlockLookupRecord(2, {
				blockName: 'Beta Shield',
				modTitle: 'Beta Pack',
				spawnCommand: 'SpawnBlock Beta_Shield(Beta_Pack)'
			})
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		const modFilter = await screen.findByRole('combobox', { name: 'Filter Mod column' });
		fireEvent.change(modFilter, { target: { value: 'add:Beta Pack' } });
		fireEvent.click(screen.getByRole('button', { name: /Copy All/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('SpawnBlock Beta_Shield(Beta_Pack)');
		});
		expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('Alpha_Cannon'));
		expect(modFilter).toHaveDisplayValue('1 active');

		fireEvent.change(modFilter, { target: { value: 'clear:' } });
		fireEvent.click(screen.getByRole('button', { name: /Copy All/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('SpawnBlock Alpha_Cannon(Alpha_Pack)'));
			expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('SpawnBlock Beta_Shield(Beta_Pack)'));
		});
	});

	it('resizes block lookup columns from the header edge', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: 1 });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		const { appState } = renderBlockLookupView();

		await screen.findAllByText('Alpha Cannon');
		const [resizeHandle] = screen.getAllByRole('slider', { name: 'Resize Block' });
		const initialWidth = Number.parseInt(resizeHandle.getAttribute('aria-valuenow') || '0', 10);
		fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					viewConfigs: expect.objectContaining({
						blockLookup: expect.objectContaining({
							columnWidthConfig: expect.objectContaining({
								blockName: expect.any(Number)
							})
						})
					})
				})
			);
			const nextConfig = vi.mocked(window.electron.updateConfig).mock.calls.at(-1)?.[0];
			expect(nextConfig?.viewConfigs.blockLookup?.columnWidthConfig?.blockName).toBeGreaterThan(initialWidth);
			expect(appState.updateState).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						viewConfigs: expect.objectContaining({
							blockLookup: expect.objectContaining({
								columnWidthConfig: expect.objectContaining({
									blockName: expect.any(Number)
								})
							})
						})
					})
				})
			);
		});
	});

	it('builds the index from the configured workshop root and loaded mods', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(null);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [], stats: null });
		vi.mocked(window.electron.buildBlockLookupIndex).mockResolvedValue({
			settings: TEST_BLOCK_LOOKUP_SETTINGS,
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
					renderedPreviewsEnabled: false,
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

	it('shows determinate build progress while the index is running', async () => {
		stubResizeObserver();
		let progressCallback: Parameters<typeof window.electron.onBlockLookupIndexProgress>[0] | undefined;
		let resolveBuild: (value: Awaited<ReturnType<typeof window.electron.buildBlockLookupIndex>>) => void = () => undefined;
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(null);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [], stats: null });
		vi.mocked(window.electron.onBlockLookupIndexProgress).mockImplementation((callback) => {
			progressCallback = callback;
			return vi.fn();
		});
		vi.mocked(window.electron.buildBlockLookupIndex).mockReturnValue(
			new Promise((resolve) => {
				resolveBuild = resolve;
			})
		);

		renderBlockLookupView();

		await screen.findByRole('button', { name: /Update Index/ });
		fireEvent.click(screen.getByRole('button', { name: /Update Index/ }));
		await screen.findByText('Index update running');
		act(() => {
			progressCallback?.({
				phase: 'indexing-sources',
				phaseLabel: 'Extracting block records',
				completed: 3,
				total: 6,
				percent: 50
			});
		});

		expect(screen.getByText('Extracting block records')).toBeInTheDocument();
		const progressBar = screen.getByRole('progressbar', { name: 'Block Lookup index progress' });
		expect(progressBar).toHaveAttribute('aria-valuenow', '50');
		expect(screen.getByText('50%')).toBeInTheDocument();

		act(() => {
			resolveBuild({ stats: TEST_STATS });
		});
		expect(await screen.findByText('Index update complete')).toBeInTheDocument();
	});

	it('keeps the full rebuild result visible after the blocking state closes', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(null);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [], stats: null });
		vi.mocked(window.electron.buildBlockLookupIndex).mockResolvedValue({
			settings: TEST_BLOCK_LOOKUP_SETTINGS,
			stats: { ...TEST_STATS, blocks: 12, sources: 3 }
		});

		renderBlockLookupView();

		await screen.findByRole('button', { name: /Full Rebuild/ });
		fireEvent.click(screen.getByRole('button', { name: /Full Rebuild/ }));

		expect(await screen.findByText('Full rebuild complete')).toBeInTheDocument();
		expect(screen.getByText('12 blocks indexed from 3 sources.')).toBeInTheDocument();
		expect(screen.queryByText('Updating block index')).not.toBeInTheDocument();
	});

	it('keeps the full rebuild failure visible after the blocking state closes', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(null);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [], stats: null });
		vi.mocked(window.electron.buildBlockLookupIndex).mockRejectedValue(new Error('Workshop root is unavailable'));

		renderBlockLookupView();

		await screen.findByRole('button', { name: /Full Rebuild/ });
		fireEvent.click(screen.getByRole('button', { name: /Full Rebuild/ }));

		expect(await screen.findByText('Full rebuild failed')).toBeInTheDocument();
		expect(screen.getByText('Workshop root is unavailable')).toBeInTheDocument();
		expect(screen.queryByText('Updating block index')).not.toBeInTheDocument();
	});

	it('shows block lookup results without paginating the virtual table', async () => {
		stubResizeObserver();
		const records = Array.from({ length: 125 }, (_value, index) => createBlockLookupRecord(index + 1));
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		expect((await screen.findAllByText('Block 001')).length).toBeGreaterThan(0);
		expect(screen.getByText('125 indexed blocks from 1 source')).toBeInTheDocument();
		expect(screen.queryByTitle('Next Page')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: /Copy All/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith(expect.stringContaining('SpawnBlock Block_125(Test_Blocks)'));
		});
	});

	it('loads all indexed rows for the blank lookup instead of applying the search result cap', async () => {
		stubResizeObserver();
		const records = Array.from({ length: 1005 }, (_value, index) => createBlockLookupRecord(index + 1));
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockImplementation(async (request) => {
			const matchingRows = request.query.trim()
				? records.filter((record) => record.spawnCommand.toLowerCase().includes(request.query.toLowerCase()))
				: records;
			return {
				rows: request.limit ? matchingRows.slice(0, request.limit) : matchingRows,
				stats: { ...TEST_STATS, blocks: records.length }
			};
		});
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		renderBlockLookupView();

		await screen.findByText('1005 indexed blocks from 1 source');
		fireEvent.click(screen.getByRole('button', { name: /Copy All/ }));

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith(expect.stringContaining('SpawnBlock Block_1005(Test_Blocks)'));
		});
		expect(window.electron.searchBlockLookup).toHaveBeenCalledWith({ query: '', limit: undefined });
	});

	it('uses fixed row geometry for virtualized block rows', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		renderBlockLookupView();

		const row = await screen.findByRole('row', { name: /Block lookup row for SpawnBlock Alpha_Cannon/ });
		expect(row).toHaveStyle({ height: '44px' });
	});

	it('matches compact virtual row geometry to coarse pointer touch sizing', async () => {
		stubResizeObserver();
		const mediaQuery = {
			matches: true,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => mediaQuery)
		);
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		renderBlockLookupView({
			config: {
				...createAppState().config,
				viewConfigs: {
					blockLookup: {
						smallRows: true
					}
				}
			}
		});

		const row = await screen.findByRole('row', { name: /Block lookup row for SpawnBlock Alpha_Cannon/ });
		expect(row).toHaveClass('CompactBlockLookupRow');
		expect(row).toHaveStyle({ height: '44px' });
	});

	it('sorts rows without canceling and reorders columns from table headers', async () => {
		stubResizeObserver();
		const records = [
			createBlockLookupRecord(2, { blockName: 'Beta Shield', spawnCommand: 'SpawnBlock Beta_Shield(Test_Blocks)' }),
			createBlockLookupRecord(1, { blockName: 'Alpha Cannon', spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)', internalName: '' })
		];
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: records.length });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: records, stats: { ...TEST_STATS, blocks: records.length } });

		const { appState } = renderBlockLookupView();

		await screen.findAllByText('Beta Shield');
		const table = screen.getByRole('table');
		const initialTableText = table?.textContent ?? '';
		expect(initialTableText.indexOf('Beta Shield')).toBeLessThan(initialTableText.indexOf('Alpha Cannon'));

		const blockHeaderButton = screen.getByRole('button', { name: 'Block' });
		const blockHeader = blockHeaderButton.closest('th');
		expect(blockHeader).toBeDefined();
		fireEvent.click(blockHeaderButton);

		await waitFor(() => {
			const tableText = table?.textContent ?? '';
			expect(tableText.indexOf('Alpha Cannon')).toBeGreaterThanOrEqual(0);
			expect(tableText.indexOf('Alpha Cannon')).toBeLessThan(tableText.indexOf('Beta Shield'));
		});
		fireEvent.click(blockHeaderButton);
		await waitFor(() => {
			const tableText = table?.textContent ?? '';
			expect(tableText.indexOf('Beta Shield')).toBeGreaterThanOrEqual(0);
			expect(tableText.indexOf('Beta Shield')).toBeLessThan(tableText.indexOf('Alpha Cannon'));
		});
		fireEvent.click(blockHeaderButton);
		await waitFor(() => {
			const tableText = table?.textContent ?? '';
			expect(tableText.indexOf('Alpha Cannon')).toBeGreaterThanOrEqual(0);
			expect(tableText.indexOf('Alpha Cannon')).toBeLessThan(tableText.indexOf('Beta Shield'));
		});
		expect(screen.getByText('Not declared')).toBeInTheDocument();

		const spawnHeader = screen.getByRole('columnheader', { name: /SpawnBlock Command/ });
		const tableHeaderDrag = createDataTransfer();
		fireEvent.dragStart(spawnHeader, { dataTransfer: tableHeaderDrag });
		fireEvent.dragOver(blockHeader as Element, { dataTransfer: tableHeaderDrag });
		fireEvent.drop(blockHeader as Element, { dataTransfer: tableHeaderDrag });

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					viewConfigs: expect.objectContaining({
						blockLookup: expect.objectContaining({
							columnOrder: ['spawnCommand', 'blockName', 'internalName', 'modTitle', 'preview'],
							columnWidthConfig: undefined
						})
					})
				})
			);
			expect(appState.updateState).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						viewConfigs: expect.objectContaining({
							blockLookup: expect.objectContaining({
								columnOrder: ['spawnCommand', 'blockName', 'internalName', 'modTitle', 'preview'],
								columnWidthConfig: undefined
							})
						})
					})
				})
			);
		});
	});

	it('reorders table settings rows by drag and drop', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: 1 });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		const { appState } = renderBlockLookupView();

		await screen.findAllByText('Alpha Cannon');
		fireEvent.click(screen.getByRole('button', { name: /Table Settings/ }));
		const dialog = await screen.findByRole('dialog');
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
							columnOrder: ['spawnCommand', 'blockName', 'internalName', 'modTitle', 'preview'],
							columnWidthConfig: undefined
						})
					})
				})
			);
			expect(appState.updateState).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						viewConfigs: expect.objectContaining({
							blockLookup: expect.objectContaining({
								columnOrder: ['spawnCommand', 'blockName', 'internalName', 'modTitle', 'preview'],
								columnWidthConfig: undefined
							})
						})
					})
				})
			);
		});
	});

	it('reorders table settings rows from keyboard-accessible move controls', async () => {
		stubResizeObserver();
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue(TEST_BLOCK_LOOKUP_SETTINGS);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue({ ...TEST_STATS, blocks: 1 });
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValue({ rows: [TEST_RECORD], stats: TEST_STATS });

		const { appState } = renderBlockLookupView();

		await screen.findAllByText('Alpha Cannon');
		fireEvent.click(screen.getByRole('button', { name: /Table Settings/ }));
		const dialog = await screen.findByRole('dialog');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Move SpawnBlock Command column right' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save Table Settings' }));

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					viewConfigs: expect.objectContaining({
						blockLookup: expect.objectContaining({
							columnOrder: ['blockName', 'internalName', 'spawnCommand', 'modTitle', 'preview'],
							columnWidthConfig: undefined
						})
					})
				})
			);
			expect(appState.updateState).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						viewConfigs: expect.objectContaining({
							blockLookup: expect.objectContaining({
								columnOrder: ['blockName', 'internalName', 'spawnCommand', 'modTitle', 'preview'],
								columnWidthConfig: undefined
							})
						})
					})
				})
			);
		});
	});
});

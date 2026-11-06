import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopulationPoolView } from '../../renderer/views/PopulationPoolView';
import { createTestConfig } from './test-utils';

const originalScanPopulationPool = window.electron.scanPopulationPool;
const originalDisablePopulationEntry = window.electron.disablePopulationEntry;
const originalUpdateConfig = window.electron.updateConfig;
afterEach(() => {
	cleanup();
	window.electron.scanPopulationPool = originalScanPopulationPool;
	window.electron.disablePopulationEntry = originalDisablePopulationEntry;
	window.electron.updateConfig = originalUpdateConfig;
});

describe('PopulationPoolView', () => {
	it('serializes rapid settings changes without losing earlier changes', async () => {
		let finishFirst!: (value: ReturnType<typeof createTestConfig>) => void;
		const update = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishFirst = resolve;
					})
			)
			.mockImplementation(async (value) => value);
		window.electron.updateConfig = update;
		const config = createTestConfig();
		render(<PopulationPoolView appState={{ config, updateState: vi.fn() }} />);
		fireEvent.click(screen.getByRole('checkbox', { name: 'Name' }));
		fireEvent.click(screen.getByRole('checkbox', { name: 'Source' }));
		await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
		await act(async () => finishFirst(update.mock.calls[0][0]));
		await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
		expect(update.mock.calls[1][0].viewConfigs.populationPool.columnActiveConfig).toMatchObject({ name: false, source: false });
	});
	it('ignores an older scan that resolves after a newer one', async () => {
		const row = {
			id: 'one',
			name: 'Old',
			source: 'active' as const,
			sourceLabel: 'Active',
			status: 'Available',
			compatibility: 'compatible' as const,
			compatibilityLabel: 'Compatible',
			canStableAdd: false,
			canDisable: false,
			canRestore: false,
			canRequestWorkshopAdd: false
		};
		let finishOld!: (result: { rows: (typeof row)[]; pathStatuses: []; warnings: [] }) => void;
		window.electron.scanPopulationPool = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishOld = resolve;
					})
			)
			.mockResolvedValueOnce({ rows: [{ ...row, name: 'New' }], pathStatuses: [], warnings: [] });
		const view = render(<PopulationPoolView appState={{ config: createTestConfig({ localDir: 'first' }), updateState: vi.fn() }} />);
		await waitFor(() => expect(finishOld).toBeDefined());
		view.rerender(<PopulationPoolView appState={{ config: createTestConfig({ localDir: 'second' }), updateState: vi.fn() }} />);
		await screen.findByRole('heading', { name: 'New' });
		await act(async () => {
			finishOld({ rows: [row], pathStatuses: [], warnings: [] });
		});
		expect(screen.getByRole('heading', { name: 'New' })).toBeInTheDocument();
	});
	it('shows an error when a population operation fails', async () => {
		window.electron.scanPopulationPool = vi.fn().mockResolvedValue({
			rows: [
				{
					id: 'one',
					name: 'Scout',
					source: 'active',
					sourceLabel: 'Active',
					status: 'Available',
					compatibility: 'compatible',
					compatibilityLabel: 'Compatible',
					canStableAdd: false,
					canDisable: true,
					canRestore: false,
					canRequestWorkshopAdd: false
				}
			],
			pathStatuses: [],
			warnings: []
		});
		window.electron.disablePopulationEntry = vi.fn().mockRejectedValueOnce(new Error('Write failed'));
		render(<PopulationPoolView appState={{ config: createTestConfig(), updateState: vi.fn() }} />);
		await screen.findByRole('heading', { name: 'Scout' });
		fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
		expect(await screen.findByText('Write failed')).toBeInTheDocument();
	});
	it('clears the inspector when filtering hides the selected row', async () => {
		window.electron.scanPopulationPool = vi.fn().mockResolvedValue({
			rows: [
				{
					id: 'one',
					name: 'Scout',
					source: 'active',
					sourceLabel: 'Active',
					status: 'Available',
					compatibility: 'compatible',
					compatibilityLabel: 'Compatible',
					canDisable: true
				}
			],
			pathStatuses: [],
			warnings: []
		});
		render(<PopulationPoolView appState={{ config: createTestConfig(), updateState: vi.fn() }} />);
		await screen.findByRole('heading', { name: 'Scout' });
		fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'no match' } });
		expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
	});
	it('selects a population row using the keyboard', async () => {
		const row = {
			id: 'one',
			name: 'Scout',
			source: 'active' as const,
			sourceLabel: 'Active',
			status: 'Available',
			compatibility: 'compatible' as const,
			compatibilityLabel: 'Compatible',
			canStableAdd: false,
			canDisable: false,
			canRestore: false,
			canRequestWorkshopAdd: false
		};
		window.electron.scanPopulationPool = vi
			.fn()
			.mockResolvedValue({ rows: [row, { ...row, id: 'two', name: 'Tank' }], pathStatuses: [], warnings: [] });
		render(<PopulationPoolView appState={{ config: createTestConfig(), updateState: vi.fn() }} />);
		const tank = await screen.findByRole('row', { name: /Tank/ });
		fireEvent.keyDown(tank, { key: 'Enter' });
		expect(tank).toHaveAttribute('aria-selected', 'true');
		expect(
			within(screen.getByRole('complementary', { name: 'Population Pool inspector' })).getByRole('heading', { name: 'Tank' })
		).toBeInTheDocument();
	});

	it('clears a saved column width when its input is emptied', async () => {
		const config = createTestConfig({ viewConfigs: { populationPool: { columnWidthConfig: { name: 280, path: 400 } } } });
		render(<PopulationPoolView appState={{ config, updateState: vi.fn() }} />);
		fireEvent.change(screen.getByRole('spinbutton', { name: 'Saved width for Name column' }), { target: { value: '' } });
		await waitFor(() =>
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({ viewConfigs: { populationPool: { columnWidthConfig: { path: 400 } } } })
			)
		);
	});

	it('keeps column controls independent of the visibility label', async () => {
		render(<PopulationPoolView appState={{ config: createTestConfig(), updateState: vi.fn() }} />);
		const visibility = screen.getByRole('checkbox', { name: 'Name' });
		const width = screen.getByRole('spinbutton', { name: 'Saved width for Name column' });
		expect(visibility).toBeChecked();
		fireEvent.click(width);
		expect(visibility).toBeChecked();
		fireEvent.click(screen.getByText('Name', { selector: 'label span' }));
		await waitFor(() =>
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					viewConfigs: expect.objectContaining({ populationPool: expect.objectContaining({ columnActiveConfig: { name: false } }) })
				})
			)
		);
	});
});

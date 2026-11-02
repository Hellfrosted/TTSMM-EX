import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopulationPoolView } from '../../renderer/views/PopulationPoolView';
import { createTestConfig } from './test-utils';

const originalScanPopulationPool = window.electron.scanPopulationPool;
afterEach(() => {
	cleanup();
	window.electron.scanPopulationPool = originalScanPopulationPool;
});

describe('PopulationPoolView', () => {
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

	it('clears a saved column width when its input is emptied', () => {
		const config = createTestConfig({ viewConfigs: { populationPool: { columnWidthConfig: { name: 280, path: 400 } } } });
		render(<PopulationPoolView appState={{ config, updateState: vi.fn() }} />);
		fireEvent.change(screen.getByRole('spinbutton', { name: 'Saved width for Name column' }), { target: { value: '' } });
		expect(window.electron.updateConfig).toHaveBeenCalledWith(
			expect.objectContaining({ viewConfigs: { populationPool: { columnWidthConfig: { path: 400 } } } })
		);
	});

	it('keeps column controls independent of the visibility label', () => {
		render(<PopulationPoolView appState={{ config: createTestConfig(), updateState: vi.fn() }} />);
		const visibility = screen.getByRole('checkbox', { name: 'Name' });
		const width = screen.getByRole('spinbutton', { name: 'Saved width for Name column' });
		expect(visibility).toBeChecked();
		fireEvent.click(width);
		expect(visibility).toBeChecked();
		fireEvent.click(screen.getByText('Name', { selector: 'label span' }));
		expect(window.electron.updateConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				viewConfigs: expect.objectContaining({ populationPool: expect.objectContaining({ columnActiveConfig: { name: false } }) })
			})
		);
	});
});

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App, { AppViewStage } from '../renderer/App';
import ViewStageLoadingFallback from '../renderer/components/loading/ViewStageLoadingFallback';
import { useAppState } from '../renderer/state/app-state';

function AppFlowProbe() {
	const location = useLocation();
	const appState = useAppState();

	return (
		<div>
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="loading-mods">{String(appState.loadingMods)}</div>
			<div data-testid="force-reload-mods">{String(appState.forceReloadMods)}</div>
		</div>
	);
}

describe('App', () => {
	it('marks inactive view stages as hidden to assistive tech without native inert', () => {
		render(<AppViewStage active={false} name="settings">Hidden settings</AppViewStage>);

		const stage = screen.getByText('Hidden settings').closest('[data-view-stage="settings"]');
		expect(stage).toHaveAttribute('aria-hidden', 'true');
		expect(stage).toHaveAttribute('data-active', 'false');
		expect(stage).not.toHaveAttribute('inert');
	});

	it('renders an accessible view-stage loading fallback', () => {
		render(<ViewStageLoadingFallback title="Loading settings" detail="Preparing controls." />);

		const status = screen.getByRole('status');
		expect(status).toHaveAttribute('aria-live', 'polite');
		expect(status).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByText('Loading settings')).toBeInTheDocument();
		expect(screen.getByText('Preparing controls.')).toBeInTheDocument();
	});

	it('should render', async () => {
		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="/" element={<App />}>
						<Route path="loading">
							<Route path="steamworks" element={<div>Steamworks</div>} />
						</Route>
					</Route>
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getByText('Steamworks')).toBeInTheDocument();
		});
	});

	it('registers app-level refresh handlers and flips loading state on mod refresh', async () => {
		let modRefreshHandler: (() => void) | undefined;
		let reloadSteamworksHandler: (() => void) | undefined;

		vi.mocked(window.electron.onModRefreshRequested).mockImplementation((callback) => {
			modRefreshHandler = callback;
			return vi.fn();
		});
		vi.mocked(window.electron.onReloadSteamworks).mockImplementation((callback) => {
			reloadSteamworksHandler = callback;
			return vi.fn();
		});

		render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="/" element={<App />}>
						<Route path="*" element={<AppFlowProbe />} />
					</Route>
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.onModRefreshRequested).toHaveBeenCalledTimes(1);
			expect(window.electron.onReloadSteamworks).toHaveBeenCalledTimes(1);
			expect(screen.getAllByTestId('location').some((element) => element.textContent === '/loading/steamworks')).toBe(true);
		});

		act(() => {
			modRefreshHandler?.();
		});

		await waitFor(() => {
			expect(screen.getAllByTestId('loading-mods').at(-1)).toHaveTextContent('true');
			expect(screen.getByTestId('force-reload-mods')).toHaveTextContent('true');
		});

		expect(reloadSteamworksHandler).toEqual(expect.any(Function));
	});
});

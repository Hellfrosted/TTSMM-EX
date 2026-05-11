import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App, { AppShell, AppViewStage, resetInitialSteamworksVerificationForTests } from '../renderer/App';
import ViewStageLoadingFallback from '../renderer/components/loading/ViewStageLoadingFallback';
import { DEFAULT_CONFIG } from '../renderer/Constants';
import { AppRoutes } from '../renderer/routes';
import { AppStateProvider, useAppStateSelector } from '../renderer/state/app-state';

const STARTUP_ROUTE_TIMEOUT_MS = 25000;
const STARTUP_ROUTE_TEST_TIMEOUT_MS = 30000;

function AppFlowProbe() {
	const location = useLocation();
	const loadingMods = useAppStateSelector((state) => state.loadingMods);
	const forceReloadMods = useAppStateSelector((state) => state.forceReloadMods);

	return (
		<div>
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="loading-mods">{String(loadingMods)}</div>
			<div data-testid="force-reload-mods">{String(forceReloadMods)}</div>
		</div>
	);
}

function InitializedConfigSeeder() {
	const updateState = useAppStateSelector((state) => state.updateState);

	React.useLayoutEffect(() => {
		updateState({ initializedConfigs: true });
	}, [updateState]);

	return null;
}

function AppShellInitializedHarness() {
	const location = useLocation();
	const navigate = useNavigate();

	return (
		<AppStateProvider navigate={(path) => void navigate(path)}>
			<InitializedConfigSeeder />
			<AppShell />
			<div data-testid="location">{location.pathname}</div>
		</AppStateProvider>
	);
}

afterEach(() => {
	cleanup();
	resetInitialSteamworksVerificationForTests();
});

describe('App', () => {
	it('marks inactive view stages as hidden to assistive tech without native inert', () => {
		render(
			<AppViewStage active={false} name="settings">
				Hidden settings
			</AppViewStage>
		);

		const stage = screen.getByText('Hidden settings').closest('[data-view-stage="settings"]');
		expect(stage).toHaveAttribute('aria-hidden', 'true');
		expect(stage).toHaveAttribute('data-active', 'false');
		expect(stage).not.toHaveAttribute('inert');
	});

	it('moves focus out of an inactive view stage before hiding it from assistive tech', async () => {
		const { rerender } = render(
			<AppViewStage active={true} name="collections">
				<button type="button">Focused row</button>
			</AppViewStage>
		);
		const focusedRow = screen.getByRole('button', { name: 'Focused row' });
		focusedRow.focus();
		expect(focusedRow).toHaveFocus();

		rerender(
			<AppViewStage active={false} name="collections">
				<button type="button">Focused row</button>
			</AppViewStage>
		);

		await waitFor(() => {
			expect(focusedRow).not.toHaveFocus();
			expect(focusedRow.closest('[data-view-stage="collections"]')).toHaveAttribute('aria-hidden', 'true');
		});
	});

	it('renders an accessible view-stage loading fallback', () => {
		render(<ViewStageLoadingFallback title="Loading settings" detail="Preparing controls." />);

		const status = screen.getByRole('status');
		expect(status).toHaveAttribute('aria-live', 'polite');
		expect(status).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByText('Loading settings')).toBeInTheDocument();
		expect(screen.getByText('Preparing controls.')).toBeInTheDocument();
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

	it('does not force Steamworks verification again when the shell remounts after config startup initialized', async () => {
		render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<AppShellInitializedHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.onModRefreshRequested).toHaveBeenCalledTimes(1);
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(screen.getByTestId('location')).toHaveTextContent('/collections/main');
		expect(document.querySelector('[data-view-stage="collections"]')).toHaveClass('is-active');
	});

	it(
		'runs the startup loading routes once before entering the collection workspace',
		async () => {
			render(
				<MemoryRouter initialEntries={['/collections/main']}>
					<AppRoutes />
				</MemoryRouter>
			);

			await waitFor(
				() => {
					expect(window.electron.steamworksInited).toHaveBeenCalledTimes(1);
					expect(window.electron.resolveStartupCollection).toHaveBeenCalledTimes(1);
					expect(window.electron.readModMetadata).toHaveBeenCalledTimes(1);
				},
				{ timeout: STARTUP_ROUTE_TIMEOUT_MS }
			);
			await new Promise((resolve) => setTimeout(resolve, 750));

			expect(window.electron.steamworksInited).toHaveBeenCalledTimes(1);
			expect(window.electron.resolveStartupCollection).toHaveBeenCalledTimes(1);
			expect(window.electron.readModMetadata).toHaveBeenCalledTimes(1);
			expect(screen.queryByText('Verifying Steamworks access')).not.toBeInTheDocument();
			expect(screen.queryByText('Preparing TTSMM-EX')).not.toBeInTheDocument();
			expect(document.querySelector('[data-view-stage="collections"]')).toHaveClass('is-active');
			expect(document.querySelector('.CollectionViewLayout')).toBeInTheDocument();
		},
		STARTUP_ROUTE_TEST_TIMEOUT_MS
	);

	it(
		'does not loop when the saved startup route points at a loading screen',
		async () => {
			vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
				...DEFAULT_CONFIG,
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map(),
				currentPath: '/loading/steamworks'
			});

			render(
				<MemoryRouter initialEntries={['/collections/main']}>
					<AppRoutes />
				</MemoryRouter>
			);

			await waitFor(
				() => {
					expect(window.electron.steamworksInited).toHaveBeenCalledTimes(1);
					expect(window.electron.resolveStartupCollection).toHaveBeenCalledTimes(1);
					expect(window.electron.readModMetadata).toHaveBeenCalledTimes(1);
				},
				{ timeout: STARTUP_ROUTE_TIMEOUT_MS }
			);
			await new Promise((resolve) => setTimeout(resolve, 750));

			expect(window.electron.steamworksInited).toHaveBeenCalledTimes(1);
			expect(window.electron.resolveStartupCollection).toHaveBeenCalledTimes(1);
			expect(window.electron.readModMetadata).toHaveBeenCalledTimes(1);
			expect(screen.queryByText('Verifying Steamworks access')).not.toBeInTheDocument();
			expect(screen.queryByText('Preparing TTSMM-EX')).not.toBeInTheDocument();
			expect(document.querySelector('[data-view-stage="collections"]')).toHaveClass('is-active');
			expect(document.querySelector('.CollectionViewLayout')).toBeInTheDocument();
		},
		STARTUP_ROUTE_TEST_TIMEOUT_MS
	);

	it('defines explicit elements for staged leaf routes', async () => {
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<AppRoutes />
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.onModRefreshRequested).toHaveBeenCalled();
		});

		expect(
			consoleWarn.mock.calls.some(([message]) =>
				String(message).includes('Matched leaf route at location "/collections/main" does not have an element or Component')
			)
		).toBe(false);

		consoleWarn.mockRestore();
	});
});

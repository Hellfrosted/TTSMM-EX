import React, { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SteamworksVerification from '../../renderer/components/loading/SteamworksVerification';
import { AppStateProvider, useAppState } from '../../renderer/state/app-state';

function AppStateSeeder({ currentPath, initializedConfigs }: { currentPath: string; initializedConfigs: boolean }) {
	const appState = useAppState();

	useEffect(() => {
		if (appState.config.currentPath === currentPath && appState.initializedConfigs === initializedConfigs) {
			return;
		}

		appState.updateState({
			initializedConfigs,
			config: {
				...appState.config,
				currentPath
			}
		});
	}, [appState, appState.config, appState.config.currentPath, appState.initializedConfigs, appState.updateState, currentPath, initializedConfigs]);

	return null;
}

function SteamworksHarness({ currentPath, initializedConfigs }: { currentPath: string; initializedConfigs: boolean }) {
	const location = useLocation();
	const appState = useAppState();

	return (
		<>
			<AppStateSeeder currentPath={currentPath} initializedConfigs={initializedConfigs} />
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="current-path">{appState.config.currentPath}</div>
			<SteamworksVerification />
		</>
	);
}

function SteamworksAppHarness({ currentPath, initializedConfigs }: { currentPath: string; initializedConfigs: boolean }) {
	const navigate = useNavigate();

	return (
		<AppStateProvider navigate={navigate}>
			<SteamworksHarness currentPath={currentPath} initializedConfigs={initializedConfigs} />
		</AppStateProvider>
	);
}

describe('SteamworksVerification', () => {
	afterEach(() => {
		cleanup();
	});

	it('returns to the saved route after reloading Steamworks', async () => {
		vi.mocked(window.electron.steamworksInited).mockResolvedValue({ inited: true });

		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="*" element={<SteamworksAppHarness currentPath="/settings" initializedConfigs />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.steamworksInited).toHaveBeenCalled();
		});

		await waitFor(() => {
			expect(screen.getByTestId('location')).toHaveTextContent('/settings');
			expect(screen.getByTestId('current-path')).toHaveTextContent('/settings');
		});
	}, 10000);

	it('shows a retry state when Steamworks verification rejects and recovers on retry', async () => {
		vi.mocked(window.electron.steamworksInited)
			.mockRejectedValueOnce(new Error('steam unavailable'))
			.mockResolvedValueOnce({ inited: true });

		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="*" element={<SteamworksAppHarness currentPath="/settings" initializedConfigs />} />
				</Routes>
			</MemoryRouter>
		);

		expect(await screen.findByText('steam unavailable')).toBeInTheDocument();
		const retryButton = screen.getByRole('button', { name: 'Retry Steamworks Initialization' });
		retryButton.click();

		await waitFor(() => {
			expect(window.electron.steamworksInited).toHaveBeenCalledTimes(2);
			expect(screen.getByTestId('location')).toHaveTextContent('/settings');
		});
	}, 10000);

	it('does not schedule follow-up timers after unmount', async () => {
		vi.useFakeTimers();
		const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
		let resolveVerification!: (value: { inited: boolean }) => void;
		vi.mocked(window.electron.steamworksInited).mockImplementationOnce(() => {
			return new Promise((resolve) => {
				resolveVerification = resolve;
			});
		});

		const view = render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="*" element={<SteamworksAppHarness currentPath="/settings" initializedConfigs />} />
				</Routes>
			</MemoryRouter>
		);
		const scheduledTimeoutsBeforeUnmount = setTimeoutSpy.mock.calls.length;

		view.unmount();
		resolveVerification({ inited: true });
		await Promise.resolve();
		await Promise.resolve();

		expect(setTimeoutSpy).toHaveBeenCalledTimes(scheduledTimeoutsBeforeUnmount);

		setTimeoutSpy.mockRestore();
		vi.useRealTimers();
	});
});

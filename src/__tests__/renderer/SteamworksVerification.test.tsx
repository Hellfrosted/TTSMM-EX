import React, { useEffect, useRef } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SteamworksVerification from '../../renderer/components/loading/SteamworksVerification';
import { AppStateProvider, useAppStateSelector } from '../../renderer/state/app-state';
import type { SteamworksReadinessKind, SteamworksStatus } from '../../shared/ipc';

function steamworksStatus(kind: SteamworksReadinessKind, error?: string): SteamworksStatus {
	return {
		inited: kind === 'ready' || kind === 'bypassed',
		error,
		readiness: {
			kind,
			retryable: kind === 'steam-not-running' || kind === 'native-module-unavailable' || kind === 'unknown-failure'
		}
	};
}

function AppStateSeeder({ currentPath, initializedConfigs }: { currentPath: string; initializedConfigs: boolean }) {
	const config = useAppStateSelector((state) => state.config);
	const currentInitializedConfigs = useAppStateSelector((state) => state.initializedConfigs);
	const updateState = useAppStateSelector((state) => state.updateState);
	const seededRef = useRef(false);

	useEffect(() => {
		if (seededRef.current) {
			return;
		}

		if (config.currentPath === currentPath && currentInitializedConfigs === initializedConfigs) {
			seededRef.current = true;
			return;
		}

		seededRef.current = true;
		updateState({
			initializedConfigs,
			config: {
				...config,
				currentPath
			}
		});
	}, [config, config.currentPath, currentInitializedConfigs, currentPath, initializedConfigs, updateState]);

	return null;
}

function SteamworksHarness({ currentPath, initializedConfigs }: { currentPath: string; initializedConfigs: boolean }) {
	const location = useLocation();
	const appCurrentPath = useAppStateSelector((state) => state.config.currentPath);

	return (
		<>
			<AppStateSeeder currentPath={currentPath} initializedConfigs={initializedConfigs} />
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="current-path">{appCurrentPath}</div>
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

	it('returns to mod collections after reloading Steamworks', async () => {
		vi.mocked(window.electron.steamworksInited).mockResolvedValue(steamworksStatus('ready'));

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
			expect(screen.getByTestId('location')).toHaveTextContent('/collections/main');
			expect(screen.getByTestId('current-path')).toHaveTextContent('/collections/main');
		});
	}, 10000);

	it('shows a retry state when Steamworks verification fails and recovers on retry', async () => {
		vi.mocked(window.electron.steamworksInited)
			.mockResolvedValueOnce(steamworksStatus('steam-not-running', 'Error: steam unavailable'))
			.mockResolvedValueOnce(steamworksStatus('ready'));

		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="*" element={<SteamworksAppHarness currentPath="/settings" initializedConfigs />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText('Steam is not available right now.').length).toBeGreaterThan(0);
			expect(screen.getAllByText('Start Steam, sign in, then retry the Steamworks check.').length).toBeGreaterThan(0);
		});
		const retryButton = screen.getByRole('button', { name: 'Try Steamworks Again' });
		retryButton.click();

		await waitFor(() => {
			expect(window.electron.steamworksInited).toHaveBeenCalledTimes(2);
			expect(screen.getByTestId('location')).toHaveTextContent('/collections/main');
		});
	}, 10000);

	it.each([
		{
			status: steamworksStatus('steam-not-running', 'Error: steam unavailable'),
			expectedTitle: 'Steam is not available right now.',
			expectedDetail: 'Start Steam, sign in, then retry the Steamworks check.'
		},
		{
			status: steamworksStatus('bypassed'),
			expectedTitle: 'Steamworks is bypassed for this development run.',
			expectedDetail: /Workshop metadata and Steam actions are disabled/
		},
		{
			status: steamworksStatus(
				'wrong-app-id',
				"Error: Steam initialization failed, but Steam is running, and steam_appid.txt is present and valid.Maybe that's not really YOUR app ID? 285920"
			),
			expectedTitle: 'Steam rejected this app ID for the signed-in account.',
			expectedDetail: /Sign in with an account that owns TerraTech/
		},
		{
			status: steamworksStatus('native-module-unavailable', 'Error: greenworks unavailable'),
			expectedTitle: 'The Steamworks files are not ready on this machine.',
			expectedDetail: 'Make sure Steamworks dependencies are installed for this build, then retry.'
		},
		{
			status: steamworksStatus('ready'),
			expectedTitle: 'Steamworks is ready',
			expectedDetail: 'Continuing to mod collections.'
		}
	])('maps $expectedTitle readiness to a user-facing startup state', async ({ expectedDetail, expectedTitle, status }) => {
		vi.mocked(window.electron.steamworksInited).mockResolvedValueOnce(status);

		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="*" element={<SteamworksAppHarness currentPath="/settings" initializedConfigs />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText(expectedTitle).length).toBeGreaterThan(0);
			expect(screen.getAllByText(expectedDetail).length).toBeGreaterThan(0);
		});
	});

	it('uses typed readiness instead of raw native error strings for wrong app ID failures', async () => {
		vi.mocked(window.electron.steamworksInited).mockResolvedValue(
			steamworksStatus('wrong-app-id', 'Error: Something new from native code')
		);

		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="*" element={<SteamworksAppHarness currentPath="/settings" initializedConfigs />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText('Steam rejected this app ID for the signed-in account.').length).toBeGreaterThan(0);
			expect(screen.getAllByText(/Sign in with an account that owns TerraTech/).length).toBeGreaterThan(0);
		});
	});

	it('does not schedule follow-up timers after unmount', async () => {
		vi.useFakeTimers();
		const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
		let resolveVerification!: (value: SteamworksStatus) => void;
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
		resolveVerification(steamworksStatus('ready'));
		await Promise.resolve();
		await Promise.resolve();

		expect(setTimeoutSpy).toHaveBeenCalledTimes(scheduledTimeoutsBeforeUnmount);

		setTimeoutSpy.mockRestore();
		vi.useRealTimers();
	});
});

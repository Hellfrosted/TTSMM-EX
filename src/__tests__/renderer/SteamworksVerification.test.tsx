import React, { useEffect, useRef } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SteamworksVerification from '../../renderer/components/loading/SteamworksVerification';
import { AppStateProvider, useAppStateSelector } from '../../renderer/state/app-state';

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
			expect(screen.getByTestId('location')).toHaveTextContent('/collections/main');
			expect(screen.getByTestId('current-path')).toHaveTextContent('/collections/main');
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

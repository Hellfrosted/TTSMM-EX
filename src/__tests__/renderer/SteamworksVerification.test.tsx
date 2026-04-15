import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ConfigLoading from '../../renderer/components/loading/ConfigLoading';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { AppStateProvider, useAppState } from '../../renderer/state/app-state';

function ConfigLoadingHarness() {
	const location = useLocation();
	const appState = useAppState();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="active-collection">{appState.activeCollection?.name || ''}</div>
			<div data-testid="config-active-collection">{appState.config.activeCollection || ''}</div>
			<div data-testid="loading-mods">{String(appState.loadingMods)}</div>
			<ConfigLoading />
		</>
	);
}

function ConfigLoadingAppHarness() {
	const navigate = useNavigate();

	return (
		<AppStateProvider navigate={navigate}>
			<ConfigLoadingHarness />
		</AppStateProvider>
	);
}

describe('ConfigLoading', () => {
	it('loads config and collections through the provider-owned boot flow', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce(['default']);
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce({ name: 'default', mods: [] });

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.readCollection).toHaveBeenCalledWith('default');
			expect(screen.getByTestId('location')).toHaveTextContent('/collections/main');
		});
	});

	it('auto-discovers and persists the TerraTech executable on first launch', async () => {
		const discoveredExecutable = 'D:\\SteamLibrary\\steamapps\\common\\TerraTech\\TerraTechWin64.exe';
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce(null);
		vi.mocked(window.electron.discoverGameExecutable).mockResolvedValueOnce(discoveredExecutable);
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce([]);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ gameExec: discoveredExecutable }));
			expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'default', mods: [] });
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'default' }));
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('default');
		});
	});

	it('boots Linux with a blank game executable without redirecting to settings', async () => {
		window.electron.platform = 'linux';
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('/home/tester/.config/TerraTech Steam Mod Manager EX');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			gameExec: '',
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce([]);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('default');
		});

		expect(window.electron.pathExists).not.toHaveBeenCalledWith('', expect.anything());
		expect(window.electron.discoverGameExecutable).not.toHaveBeenCalled();
	});

	it('ignores stale TerraTech executable paths during Linux boot', async () => {
		window.electron.platform = 'linux';
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('/home/tester/.config/TerraTech Steam Mod Manager EX');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			gameExec: 'C:\\Missing\\TerraTechWin64.exe',
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce([]);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('default');
		});

		expect(window.electron.pathExists).not.toHaveBeenCalledWith('C:\\Missing\\TerraTechWin64.exe', expect.anything());
		expect(window.electron.discoverGameExecutable).not.toHaveBeenCalled();
	});

	it('routes invalid configs to settings without kicking off mod loading', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			gameExec: 'C:\\Missing\\TerraTechWin64.exe',
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.pathExists).mockResolvedValue(false);
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce([]);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/settings');
			expect(screen.getAllByTestId('loading-mods').at(-1)).toHaveTextContent('false');
		});
	});

	it('normalizes legacy relative collection routes during boot', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: 'collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce(['default']);
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce({ name: 'default', mods: [] });

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').some((element) => element.textContent === '/collections/main')).toBe(true);
		});
	});

	it('normalizes the bare collections route during boot', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce(['default']);
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce({ name: 'default', mods: [] });

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').some((element) => element.textContent === '/collections/main')).toBe(true);
		});
	});

	it('keeps the discovered active collection in config during boot fallback selection', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce(['zeta', 'alpha']);
		vi.mocked(window.electron.readCollection)
			.mockResolvedValueOnce({ name: 'zeta', mods: [] })
			.mockResolvedValueOnce({ name: 'alpha', mods: [] });

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'alpha' }));
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('config-active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
		});
	});
});

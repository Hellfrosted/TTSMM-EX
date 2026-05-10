import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ConfigLoading from '../../renderer/components/loading/ConfigLoading';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { AppStateProvider, useAppStateSelector } from '../../renderer/state/app-state';
import { createTestQueryClient } from './test-utils';
import type { AppConfig, ModCollection } from '../../model';

function ConfigLoadingHarness() {
	const location = useLocation();
	const activeCollection = useAppStateSelector((state) => state.activeCollection);
	const config = useAppStateSelector((state) => state.config);
	const loadingMods = useAppStateSelector((state) => state.loadingMods);

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<div data-testid="active-collection">{activeCollection?.name || ''}</div>
			<div data-testid="config-active-collection">{config.activeCollection || ''}</div>
			<div data-testid="config-game-exec">{config.gameExec || ''}</div>
			<div data-testid="loading-mods">{String(loadingMods)}</div>
			<ConfigLoading />
		</>
	);
}

function ConfigLoadingAppHarness() {
	const navigate = useNavigate();
	const [queryClient] = React.useState(() => createTestQueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			<AppStateProvider navigate={navigate}>
				<ConfigLoadingHarness />
			</AppStateProvider>
		</QueryClientProvider>
	);
}

function startupSuccess(config: AppConfig, activeCollection: ModCollection, collections: ModCollection[] = [activeCollection]) {
	return {
		ok: true as const,
		activeCollection,
		collections,
		collectionNames: collections.map((collection) => collection.name),
		config: {
			...config,
			activeCollection: activeCollection.name
		}
	};
}

describe('ConfigLoading', () => {
	it('uses the corrected default Windows executable path', () => {
		expect(DEFAULT_CONFIG.gameExec).toBe('C:\\Program Files (x86)\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe');
	});

	it('loads config and collections through the provider-owned boot flow', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.resolveStartupCollection).mockImplementationOnce(async ({ config }) =>
			startupSuccess(config, { name: 'default', mods: [] })
		);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.resolveStartupCollection).toHaveBeenCalledWith({
				config: expect.objectContaining({ currentPath: '/collections/main' })
			});
			expect(screen.getByTestId('location')).toHaveTextContent('/collections/main');
		});
	});

	it('auto-discovers and persists the TerraTech executable on first launch', async () => {
		const discoveredExecutable = 'D:\\SteamLibrary\\steamapps\\common\\TerraTech\\TerraTechWin64.exe';
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce(null);
		vi.mocked(window.electron.discoverGameExecutable).mockResolvedValueOnce(discoveredExecutable);
		vi.mocked(window.electron.resolveStartupCollection).mockImplementationOnce(async ({ config }) =>
			startupSuccess(config, { name: 'default', mods: [] })
		);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ gameExec: discoveredExecutable }));
			expect(window.electron.resolveStartupCollection).toHaveBeenCalledWith({
				config: expect.objectContaining({ gameExec: discoveredExecutable })
			});
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('default');
		});
	});

	it('does not keep an auto-discovered executable in memory when persisting it fails', async () => {
		const discoveredExecutable = 'D:\\SteamLibrary\\steamapps\\common\\TerraTech\\TerraTechWin64.exe';
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce(null);
		vi.mocked(window.electron.discoverGameExecutable).mockResolvedValueOnce(discoveredExecutable);
		vi.mocked(window.electron.resolveStartupCollection).mockImplementationOnce(async ({ config }) =>
			startupSuccess(config, { name: 'default', mods: [] })
		);
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(null);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(1);
			expect(screen.getAllByTestId('config-game-exec').at(-1)).toHaveTextContent(DEFAULT_CONFIG.gameExec);
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

	it.each([
		'collections/main',
		'/collections',
		'/settings',
		'/block-lookup'
	])('normalizes saved route "%s" to collections during boot', async (currentPath) => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath,
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});

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
		vi.mocked(window.electron.resolveStartupCollection).mockImplementationOnce(async ({ config }) =>
			startupSuccess(config, { name: 'alpha', mods: [] }, [
				{ name: 'alpha', mods: [] },
				{ name: 'zeta', mods: [] }
			])
		);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('config-active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
		});
	});

	it('applies collections returned by Startup Collection Resolution', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.resolveStartupCollection).mockImplementationOnce(async ({ config }) =>
			startupSuccess(config, { name: 'alpha', mods: ['local:a'] }, [
				{ name: 'alpha', mods: ['local:a'] },
				{ name: 'zeta', mods: [] }
			])
		);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.resolveStartupCollection).toHaveBeenCalledOnce();
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
		});
	});

	it('halts boot when persisting a repaired active collection fails', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.resolveStartupCollection).mockResolvedValueOnce({
			ok: false,
			code: 'config-write-failed',
			message: 'Failed to persist repaired active collection alpha'
		});

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText('TTSMM-EX could not save which collection should open.').length).toBeGreaterThan(0);
		});

		expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/loading/config');
		expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('');
		expect(screen.getAllByTestId('config-active-collection').at(-1)).toHaveTextContent('');
	});

	it('halts boot when persisting the default collection fails', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.resolveStartupCollection).mockResolvedValueOnce({
			ok: false,
			code: 'collection-write-failed',
			message: 'Failed to persist the default collection during boot'
		});

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText('TTSMM-EX could not create the default collection it needs to start.').length).toBeGreaterThan(0);
		});

		expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/loading/config');
		expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('');
		expect(window.electron.updateCollection).not.toHaveBeenCalled();
	});

	it('halts boot and surfaces a collection load error instead of creating a fallback collection', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce({
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});
		vi.mocked(window.electron.resolveStartupCollection).mockResolvedValueOnce({
			ok: false,
			code: 'collection-read-failed',
			message: 'Failed to load collection "broken"'
		});

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText('One of your saved collections could not be opened.').length).toBeGreaterThan(0);
		});

		expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/loading/config');
		expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('');
		expect(window.electron.updateCollection).not.toHaveBeenCalled();
	});

	it('halts boot and surfaces a config load error instead of treating it as first launch', async () => {
		vi.mocked(window.electron.getUserDataPath).mockResolvedValueOnce('C:\\Users\\tester\\AppData\\Roaming\\ttsmm');
		vi.mocked(window.electron.readConfig).mockRejectedValueOnce(
			new Error('Failed to load config file "C:\\Users\\tester\\AppData\\Roaming\\ttsmm\\config.json"')
		);

		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<Routes>
					<Route path="*" element={<ConfigLoadingAppHarness />} />
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByText('TTSMM-EX could not read your saved settings.').length).toBeGreaterThan(0);
		});

		expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/loading/config');
		expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('');
		expect(window.electron.discoverGameExecutable).not.toHaveBeenCalled();
		expect(window.electron.updateCollection).not.toHaveBeenCalled();
	});
});

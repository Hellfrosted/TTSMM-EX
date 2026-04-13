import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigKeys, AppState, CollectionManagerModalType, CollectionViewType, ModType, SessionMods, SettingsViewModalType, setupDescriptors } from '../../model';
import App from '../../renderer/App';
import CollectionManagementToolbar from '../../renderer/components/collections/CollectionManagementToolbar';
import CollectionManagerModal from '../../renderer/components/collections/CollectionManagerModal';
import MainCollectionComponent from '../../renderer/components/collections/MainCollectionComponent';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useSettingsForm } from '../../renderer/hooks/useSettingsForm';
import { useCollections } from '../../renderer/hooks/collections/useCollections';
import { useCollectionValidation } from '../../renderer/hooks/collections/useCollectionValidation';
import ConfigLoading from '../../renderer/components/loading/ConfigLoading';
import { AppStateProvider, appReducer, mergeAppState, setActiveCollection, useAppState } from '../../renderer/state/app-state';
import CollectionRoute from '../../renderer/views/CollectionView';

vi.mock('../../util/Date', () => ({
	formatDateStr: vi.fn(() => '2026-04-08')
}));

function createAppState(overrides: Partial<AppState> = {}): AppState {
	const state: AppState = {
		config: { ...DEFAULT_CONFIG, currentPath: '/collections/main', viewConfigs: {}, ignoredValidationErrors: new Map(), userOverrides: new Map() },
		userDataPath: '',
		mods: new SessionMods('', []),
		allCollections: new Map(),
		allCollectionNames: new Set<string>(),
		activeCollection: undefined,
		firstModLoad: false,
		sidebarCollapsed: true,
		launchingGame: false,
		initializedConfigs: false,
		savingConfig: false,
		configErrors: {},
		loadingMods: false,
		updateState: vi.fn((props: Partial<AppState>) => {
			Object.assign(state, props);
		}),
		navigate: vi.fn(),
		...overrides
	};

	return state;
}

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

function CollectionRouteHarness({ appState }: { appState: AppState }) {
	const location = useLocation();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<Outlet context={appState} />
		</>
	);
}

describe('renderer flows', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('selects a settings path through the promise-based preload API', async () => {
		const appState = createAppState();
		vi.mocked(window.electron.selectPath).mockResolvedValueOnce('C:\\Games\\TerraTech\\LocalMods');
		const { result } = renderHook(() => useSettingsForm(appState));

		await act(async () => {
			await result.current.selectPath(AppConfigKeys.LOCAL_DIR, true, 'Select TerraTech LocalMods directory');
		});

		expect(window.electron.selectPath).toHaveBeenCalledWith(true, 'Select TerraTech LocalMods directory');
		expect(result.current.editingConfig.localDir).toBe('C:\\Games\\TerraTech\\LocalMods');
	});

	it('resets settings edits back to the saved config', () => {
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				localDir: 'C:\\TerraTech\\LocalMods',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			}
		});
		const { result } = renderHook(() => useSettingsForm(appState));

		act(() => {
			result.current.setField(AppConfigKeys.LOCAL_DIR, 'D:\\Temp\\LocalMods');
		});

		expect(appState.updateState).toHaveBeenCalledWith({ madeConfigEdits: true });
		expect(result.current.editingConfig.localDir).toBe('D:\\Temp\\LocalMods');

		act(() => {
			result.current.cancelChanges();
		});

		expect(result.current.editingConfig.localDir).toBe('C:\\TerraTech\\LocalMods');
		expect(result.current.modalType).toBe(SettingsViewModalType.NONE);
		expect(appState.updateState).toHaveBeenCalledWith({ madeConfigEdits: false });
	});

	it('updates reducer-owned app state through explicit actions', () => {
		const initialState = createAppState();
		const collection = { name: 'default', mods: [] };

		const mergedState = appReducer(initialState, mergeAppState({ sidebarCollapsed: false, launchingGame: true }));
		const finalState = appReducer(mergedState, setActiveCollection(collection));

		expect(finalState.sidebarCollapsed).toBe(false);
		expect(finalState.launchingGame).toBe(true);
		expect(finalState.activeCollection).toEqual(collection);
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
					<Route
						path="/"
						element={<App />}
					>
						<Route path="*" element={<AppFlowProbe />} />
					</Route>
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(window.electron.onModRefreshRequested).toHaveBeenCalledTimes(1);
			expect(window.electron.onReloadSteamworks).toHaveBeenCalledTimes(1);
			expect(screen.getAllByTestId('location')).toEqual(expect.any(Array));
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

	it('renders the main collection view even from the parent collection route', async () => {
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([['default', activeCollection]]),
			allCollectionNames: new Set(['default'])
		});
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal(
			'ResizeObserver',
			ResizeObserverMock
		);

		render(
			<MemoryRouter initialEntries={['/collections']}>
				<Routes>
					<Route path="/" element={<CollectionRouteHarness appState={appState} />}>
						<Route path="collections" element={<CollectionRoute />}>
							<Route index element={<Navigate replace to="main" />} />
							<Route path="main" element={<MainCollectionComponent />} />
							<Route path="*" element={<Navigate replace to="main" />} />
						</Route>
					</Route>
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections');
		});

		expect(screen.getAllByText('Launch Game').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
	});

	it('clears config errors after saving settings changes', async () => {
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				gameExec: 'C:\\Games\\TerraTech\\TerraTechWin64.exe',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			configErrors: {
				gameExec: 'old error'
			}
		});
		const { result } = renderHook(() => useSettingsForm(appState));

		act(() => {
			result.current.setField(AppConfigKeys.GAME_EXEC, 'D:\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe');
		});

		await act(async () => {
			await result.current.saveChanges();
		});

		expect(window.electron.updateConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				gameExec: 'D:\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe'
			})
		);
		expect(appState.configErrors).toEqual({});
	});

	it('switches active collections immutably and persists the selected collection name', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});

		const { result } = renderHook(() =>
			useCollections({
				appState,
				openNotification: vi.fn(),
				cancelValidation: vi.fn(),
				resetValidationState: vi.fn(),
				validateActiveCollection: vi.fn(async () => undefined),
				setModalType: vi.fn()
			})
		);

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'alt' }));
		});
		expect(appState.activeCollection).toEqual(altCollection);
		expect(appState.activeCollection).not.toBe(altCollection);
		expect(appState.config.activeCollection).toBe('alt');
	});

	it('keeps the mod manager enabled when bulk-updating a collection selection', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:mod-z'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: defaultCollection
		});
		const cancelValidation = vi.fn();
		const validateActiveCollection = vi.fn(async () => undefined);

		const { result, rerender } = renderHook(() =>
			useCollections({
				appState,
				openNotification: vi.fn(),
				cancelValidation,
				resetValidationState: vi.fn(),
				validateActiveCollection,
				setModalType: vi.fn()
			})
		);

		act(() => {
			result.current.setEnabledMods(new Set(['local:mod-a']));
		});
		rerender();

		await waitFor(() => {
			expect(validateActiveCollection).toHaveBeenCalledWith(false);
		});
		expect(cancelValidation).toHaveBeenCalled();
		expect(appState.activeCollection?.mods).toEqual([`local:mod-a`, `workshop:${DEFAULT_CONFIG.workshopID}`]);
		expect(appState.allCollections.get('archived')).toBe(archivedCollection);
		expect(result.current.madeEdits).toBe(true);
	});

	it('preserves untouched collection objects when creating a collection', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:mod-z'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: defaultCollection
		});

		const { result } = renderHook(() =>
			useCollections({
				appState,
				openNotification: vi.fn(),
				cancelValidation: vi.fn(),
				resetValidationState: vi.fn(),
				validateActiveCollection: vi.fn(async () => undefined),
				setModalType: vi.fn()
			})
		);

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		await waitFor(() => {
			expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'fresh', mods: [] });
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'fresh' }));
		});
		expect(appState.allCollections.get('default')).toBe(defaultCollection);
		expect(appState.allCollections.get('archived')).toBe(archivedCollection);
		expect(appState.activeCollection).toEqual({ name: 'fresh', mods: [] });
	});

	it('opens the collection rename modal when the toolbar action is clicked', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		const { container } = render(
			<CollectionManagementToolbar
				appState={appState}
				searchString=""
				openModal={vi.fn()}
				saveCollectionCallback={vi.fn()}
				changeActiveCollectionCallback={vi.fn()}
				validateCollectionCallback={vi.fn()}
				onReloadModListCallback={vi.fn()}
				openViewSettingsCallback={vi.fn()}
				onSearchCallback={vi.fn()}
				onSearchChangeCallback={vi.fn()}
				newCollectionCallback={vi.fn()}
				duplicateCollectionCallback={vi.fn()}
				renameCollectionCallback={vi.fn()}
				openNotification={vi.fn()}
			/>
		);

		const renameButton = within(container).getByText('Rename').closest('button');
		expect(renameButton).not.toBeNull();
		fireEvent.click(renameButton!);

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Rename Collection' })).toBeDisabled();
		});
	}, 10000);

	it('persists dirty collection edits before switching active collections', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});
		const resetValidationState = vi.fn();

		const { result } = renderHook(() =>
			useCollections({
				appState,
				openNotification: vi.fn(),
				cancelValidation: vi.fn(),
				resetValidationState,
				validateActiveCollection: vi.fn(async () => undefined),
				setModalType: vi.fn()
			})
		);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		await waitFor(() => {
			expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'default', mods: ['local:dirty'] });
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'alt' }));
		});
		expect(resetValidationState).toHaveBeenCalled();
		expect(result.current.madeEdits).toBe(false);
		expect(appState.activeCollection).toEqual(altCollection);
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
			expect(screen.getAllByTestId('active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('config-active-collection').at(-1)).toHaveTextContent('alpha');
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections/main');
		});
	});

	it('does not treat a previous validation result as current after switching collections', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true),
				launchMods: vi.fn(async () => undefined)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(true);

		act(() => {
			appState.activeCollection = { name: 'alt', mods: ['local:b'] };
		});
		rerender();

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(false);
	});

	it('shows per-mod validation details in the configuration error modal', async () => {
		const brokenMod = {
			uid: 'workshop:1',
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'BrokenMod',
			name: 'Broken Mod'
		};
		const conflictingMod = {
			uid: 'workshop:2',
			type: ModType.WORKSHOP,
			workshopID: BigInt(2),
			id: 'ConflictingMod',
			name: 'Conflicting Mod'
		};
		const mods = new SessionMods('', [brokenMod, conflictingMod]);
		mods.modIdToModDataMap.set(brokenMod.uid, brokenMod);
		mods.modIdToModDataMap.set(conflictingMod.uid, conflictingMod);
		const appState = createAppState({ mods });

		render(
			<CollectionManagerModal
				appState={appState}
				modalType={CollectionManagerModalType.ERRORS_FOUND}
				launchGameWithErrors={false}
				currentView={CollectionViewType.MAIN}
				collectionErrors={{
					[brokenMod.uid]: {
						missingDependencies: [{ UIDs: new Set(), name: 'NuterraSteam (Beta)' }],
						incompatibleMods: [conflictingMod.uid]
					}
				}}
				launchAnyway={vi.fn()}
				openNotification={vi.fn()}
				closeModal={vi.fn()}
				currentRecord={brokenMod}
				deleteCollection={vi.fn()}
			/>
		);

		expect(await screen.findByText('Errors Found in Configuration')).toBeInTheDocument();
		expect(screen.getByText('Affected Mods')).toBeInTheDocument();
		expect(screen.getByText('Broken Mod')).toBeInTheDocument();
		expect(screen.getByText('Missing dependencies: NuterraSteam (Beta)')).toBeInTheDocument();
		expect(screen.getByText('Conflicts with: Conflicting Mod')).toBeInTheDocument();
	});
});

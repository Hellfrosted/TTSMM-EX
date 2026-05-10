import { Suspense, lazy, useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import api from 'renderer/Api';
import {
	createAppShellViewModel,
	createBlockLookupStageAppState,
	createCollectionStageAppState,
	createSettingsStageAppState,
	getAppRouteKind
} from './app-view-model';
import ViewStageLoadingFallback from './components/loading/ViewStageLoadingFallback';
import { NotificationViewport } from './components/NotificationViewport';
import { AppStateProvider, useAppStateSelector, type CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { appCssVariables } from './theme';
import { AppQueryProvider } from './query-client';

const loadCollectionView = () => import('./views/CollectionView');
const loadSettingsView = () => import('./views/SettingsView');
const loadBlockLookupView = () => import('./views/BlockLookupView');
const loadMenuBar = () => import('./components/MenuBar');

const CollectionViewLazy = lazy(async () => {
	const module = await loadCollectionView();
	return { default: module.CollectionView };
});

const SettingsViewLazy = lazy(async () => {
	const module = await loadSettingsView();
	return { default: module.SettingsView };
});

const BlockLookupViewLazy = lazy(async () => {
	const module = await loadBlockLookupView();
	return { default: module.BlockLookupView };
});

const MenuBarLazy = lazy(async () => {
	const module = await loadMenuBar();
	return { default: module.default };
});

interface AppViewStageProps extends PropsWithChildren {
	active: boolean;
	name: 'loading' | 'collections' | 'settings' | 'block-lookup';
	overflow?: 'auto' | 'hidden';
}

export function AppViewStage({ active, children, name, overflow = 'hidden' }: AppViewStageProps) {
	return (
		<div
			aria-hidden={!active}
			className={`AppViewStage${active ? ' is-active' : ''}`}
			data-active={active ? 'true' : 'false'}
			data-view-stage={name}
			style={{
				overflow
			}}
		>
			{children}
		</div>
	);
}

function CollectionsStageView() {
	const activeCollection = useAppStateSelector((state) => state.activeCollection);
	const allCollectionNames = useAppStateSelector((state) => state.allCollectionNames);
	const allCollections = useAppStateSelector((state) => state.allCollections);
	const config = useAppStateSelector((state) => state.config);
	const forceReloadMods = useAppStateSelector((state) => state.forceReloadMods);
	const launchingGame = useAppStateSelector((state) => state.launchingGame);
	const loadingMods = useAppStateSelector((state) => state.loadingMods);
	const mods = useAppStateSelector((state) => state.mods);
	const updateState = useAppStateSelector((state) => state.updateState);
	const appState = useMemo<CollectionWorkspaceAppState>(
		() =>
			createCollectionStageAppState({
				activeCollection,
				allCollectionNames,
				allCollections,
				config,
				forceReloadMods,
				launchingGame,
				loadingMods,
				mods,
				updateState
			}),
		[activeCollection, allCollectionNames, allCollections, config, forceReloadMods, launchingGame, loadingMods, mods, updateState]
	);
	return <CollectionViewLazy appState={appState} />;
}

function SettingsStageView() {
	const config = useAppStateSelector((state) => state.config);
	const configErrors = useAppStateSelector((state) => state.configErrors);
	const madeConfigEdits = useAppStateSelector((state) => state.madeConfigEdits);
	const savingConfig = useAppStateSelector((state) => state.savingConfig);
	const updateState = useAppStateSelector((state) => state.updateState);
	const appState = useMemo(
		() =>
			createSettingsStageAppState({
				config,
				configErrors,
				madeConfigEdits,
				savingConfig,
				updateState
			}),
		[config, configErrors, madeConfigEdits, savingConfig, updateState]
	);
	return <SettingsViewLazy appState={appState} />;
}

function BlockLookupStageView() {
	const config = useAppStateSelector((state) => state.config);
	const mods = useAppStateSelector((state) => state.mods);
	const updateState = useAppStateSelector((state) => state.updateState);
	const appState = useMemo(
		() =>
			createBlockLookupStageAppState({
				config,
				mods,
				updateState
			}),
		[config, mods, updateState]
	);
	return <BlockLookupViewLazy appState={appState} />;
}

function LoadingStageOutlet() {
	return <Outlet />;
}

function preloadWorkspaceRoutes() {
	void loadSettingsView();
	void loadBlockLookupView();
}

function MenuBarStageView({ disableNavigation }: { disableNavigation: boolean }) {
	const config = useAppStateSelector((state) => state.config);
	const firstModLoad = useAppStateSelector((state) => Boolean(state.firstModLoad));
	const updateState = useAppStateSelector((state) => state.updateState);
	return <MenuBarLazy config={config} disableNavigation={disableNavigation} firstModLoad={firstModLoad} updateState={updateState} />;
}

function AppShell() {
	const location = useLocation();
	const navigateApp = useAppStateSelector((state) => state.navigate);
	const updateAppState = useAppStateSelector((state) => state.updateState);
	const launchingGame = useAppStateSelector((state) => state.launchingGame);
	const sidebarCollapsed = useAppStateSelector((state) => state.sidebarCollapsed);
	const savingConfig = useAppStateSelector((state) => state.savingConfig);
	const madeConfigEdits = useAppStateSelector((state) => state.madeConfigEdits);
	const configErrorCount = useAppStateSelector((state) => Object.keys(state.configErrors || {}).length);
	const activeCollection = useAppStateSelector((state) => state.activeCollection);
	const loadingMods = useAppStateSelector((state) => state.loadingMods);
	const initialRouteKind = getAppRouteKind(location.pathname);
	const [mountedStages, setMountedStages] = useState({
		blockLookup: initialRouteKind === 'block-lookup',
		collections: initialRouteKind === 'collections',
		settings: initialRouteKind === 'settings'
	});
	const appShell = createAppShellViewModel({
		activeCollection,
		configErrorCount,
		launchingGame: !!launchingGame,
		loadingMods: !!loadingMods,
		madeConfigEdits: !!madeConfigEdits,
		pathname: location.pathname,
		savingConfig: !!savingConfig
	});
	const navigateToSteamworks = useEffectEvent(() => {
		navigateApp('/loading/steamworks');
	});
	const startForcedModReload = useEffectEvent(() => {
		updateAppState({ loadingMods: true, forceReloadMods: true });
	});

	useEffect(() => {
		if (window.electron.uiSmokeMode) {
			return undefined;
		}

		navigateToSteamworks();
		const unsubscribeModRefresh = api.onModRefreshRequested(() => {
			startForcedModReload();
		});
		const unsubscribeReloadSteamworks = api.onReloadSteamworks(() => {
			navigateToSteamworks();
		});

		return () => {
			unsubscribeModRefresh();
			unsubscribeReloadSteamworks();
		};
	}, []);

	useEffect(() => {
		if (appShell.isLoadingRoute) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			const stageKey = appShell.isSettingsRoute ? 'settings' : appShell.isBlockLookupRoute ? 'blockLookup' : 'collections';
			setMountedStages((current) => (current[stageKey] ? current : { ...current, [stageKey]: true }));
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [appShell.isBlockLookupRoute, appShell.isLoadingRoute, appShell.isSettingsRoute]);

	useEffect(() => {
		if (appShell.isLoadingRoute) {
			return undefined;
		}

		if (typeof window.requestIdleCallback === 'function') {
			const idleId = window.requestIdleCallback(preloadWorkspaceRoutes, { timeout: 1000 });
			return () => {
				window.cancelIdleCallback(idleId);
			};
		}

		const timeoutId = window.setTimeout(preloadWorkspaceRoutes, 250);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [appShell.isLoadingRoute]);

	return (
		<div className="AppLayout">
			<aside className={`AppSidebar MenuBar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
				<div className="logo" />
				<Suspense fallback={null}>
					<MenuBarStageView disableNavigation={appShell.disableNavigation} />
				</Suspense>
				<button
					type="button"
					className="MenuCollapseButton"
					aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					aria-pressed={sidebarCollapsed}
					onClick={() => {
						updateAppState({ sidebarCollapsed: !sidebarCollapsed });
					}}
				>
					{sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
				</button>
			</aside>
			<div className="AppViewHost">
				<AppViewStage active={appShell.isLoadingRoute} name="loading">
					{appShell.isLoadingRoute ? <LoadingStageOutlet /> : null}
				</AppViewStage>
				{mountedStages.collections && appShell.hasCollectionWorkspace ? (
					<AppViewStage active={appShell.showCollections} name="collections">
						<Suspense
							fallback={
								<ViewStageLoadingFallback title="Loading mod workspace" detail="Preparing collections, filters, and validation controls." />
							}
						>
							<CollectionsStageView />
						</Suspense>
					</AppViewStage>
				) : null}
				{mountedStages.settings ? (
					<AppViewStage active={appShell.showSettings} name="settings" overflow="auto">
						<Suspense
							fallback={
								<ViewStageLoadingFallback title="Loading settings" detail="Preparing paths, launch options, and logging controls." />
							}
						>
							<SettingsStageView />
						</Suspense>
					</AppViewStage>
				) : null}
				{mountedStages.blockLookup ? (
					<AppViewStage active={appShell.showBlockLookup} name="block-lookup">
						<Suspense
							fallback={
								<ViewStageLoadingFallback title="Loading block lookup" detail="Preparing the block alias index and search controls." />
							}
						>
							<BlockLookupStageView />
						</Suspense>
					</AppViewStage>
				) : null}
			</div>
		</div>
	);
}

export default function App() {
	const navigate = useNavigate();
	const navigateApp = useCallback(
		(path: string) => {
			void navigate(path);
		},
		[navigate]
	);

	return (
		<div className="AppRoot" style={{ ...appCssVariables, width: '100%', height: '100%' }}>
			<AppQueryProvider>
				<AppStateProvider navigate={navigateApp}>
					<AppShell />
					<NotificationViewport />
				</AppStateProvider>
			</AppQueryProvider>
		</div>
	);
}

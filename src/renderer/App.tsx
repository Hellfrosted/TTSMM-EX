import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import {
	lazy,
	memo,
	Suspense,
	useCallback,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState
} from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import api from 'renderer/Api';
import { AppStateProvider, type CollectionWorkspaceAppState, useAppStateSelector } from 'renderer/state/app-state';
import {
	createAppShellViewModel,
	createBlockLookupStageAppState,
	createCollectionStageAppState,
	createSettingsStageAppState,
	getAppRouteKind
} from './app-view-model';
import ViewStageLoadingFallback from './components/loading/ViewStageLoadingFallback';
import { NotificationViewport } from './components/NotificationViewport';
import { EffectAtomRendererProof } from './effect-atom-renderer-proof';
import { appCssVariables } from './theme';

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

let initialSteamworksVerificationRequested = false;

export function resetInitialSteamworksVerificationForTests() {
	initialSteamworksVerificationRequested = false;
}

interface AppViewStageProps extends PropsWithChildren {
	active: boolean;
	name: 'loading' | 'collections' | 'settings' | 'block-lookup';
	overflow?: 'auto' | 'hidden';
}

export function AppViewStage({ active, children, name, overflow = 'hidden' }: AppViewStageProps) {
	const stageRef = useRef<HTMLDivElement>(null);
	const [containsFocus, setContainsFocus] = useReducer((_current: boolean, next: boolean) => next, false);
	const hideFromAssistiveTech = !active && !containsFocus;

	useLayoutEffect(() => {
		if (active || !containsFocus) {
			return;
		}

		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLElement && stageRef.current?.contains(activeElement)) {
			activeElement.blur();
		}
	}, [active, containsFocus]);

	return (
		<div
			ref={stageRef}
			aria-hidden={hideFromAssistiveTech || undefined}
			className={`AppViewStage${active ? ' is-active' : ''}`}
			data-active={active ? 'true' : 'false'}
			data-view-stage={name}
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
					setContainsFocus(false);
				}
			}}
			onFocusCapture={() => {
				setContainsFocus(true);
			}}
			style={{
				overflow
			}}
		>
			{children}
		</div>
	);
}

const CollectionsStageView = memo(function CollectionsStageView() {
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
});

const SettingsStageView = memo(function SettingsStageView() {
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
});

const BlockLookupStageView = memo(function BlockLookupStageView() {
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
});

function LoadingStageOutlet() {
	return <Outlet />;
}

function preloadWorkspaceRoutes() {
	void loadSettingsView();
	void loadBlockLookupView();
}

function getWorkspaceStageKey(pathname: string): keyof AppShellMountedStages {
	const routeKind = getAppRouteKind(pathname);
	return routeKind === 'settings' ? 'settings' : routeKind === 'block-lookup' ? 'blockLookup' : 'collections';
}

interface AppShellMountedStages {
	blockLookup: boolean;
	collections: boolean;
	settings: boolean;
}

function MenuBarStageView({
	disableNavigation,
	onWorkspacePreview
}: {
	disableNavigation: boolean;
	onWorkspacePreview: (path: string) => void;
}) {
	const config = useAppStateSelector((state) => state.config);
	const updateState = useAppStateSelector((state) => state.updateState);
	return (
		<MenuBarLazy config={config} disableNavigation={disableNavigation} onWorkspacePreview={onWorkspacePreview} updateState={updateState} />
	);
}

export function AppShell() {
	const location = useLocation();
	const [previewPathname, setPreviewPathname] = useReducer((_current: string | null, next: string | null) => next, null);
	const currentPathname = location.pathname;
	const committedPathnameRef = useRef(currentPathname);
	const navigateApp = useAppStateSelector((state) => state.navigate);
	const updateAppState = useAppStateSelector((state) => state.updateState);
	const launchingGame = useAppStateSelector((state) => state.launchingGame);
	const sidebarCollapsed = useAppStateSelector((state) => state.sidebarCollapsed);
	const savingConfig = useAppStateSelector((state) => state.savingConfig);
	const madeConfigEdits = useAppStateSelector((state) => state.madeConfigEdits);
	const configErrorCount = useAppStateSelector((state) => Object.keys(state.configErrors || {}).length);
	const activeCollection = useAppStateSelector((state) => state.activeCollection);
	const loadingMods = useAppStateSelector((state) => state.loadingMods);
	const initializedConfigs = useAppStateSelector((state) => state.initializedConfigs);
	const initializedConfigsRef = useRef(initializedConfigs);
	initializedConfigsRef.current = initializedConfigs;
	const initialRouteKind = getAppRouteKind(currentPathname);
	const [mountedStages, setMountedStages] = useState<AppShellMountedStages>({
		blockLookup: initialRouteKind === 'block-lookup',
		collections: initialRouteKind === 'collections',
		settings: initialRouteKind === 'settings'
	});
	const effectivePathname = previewPathname ?? currentPathname;
	const appShell = createAppShellViewModel({
		activeCollection,
		configErrorCount,
		launchingGame: !!launchingGame,
		loadingMods: !!loadingMods,
		madeConfigEdits: !!madeConfigEdits,
		pathname: effectivePathname,
		savingConfig: !!savingConfig
	});
	const navigateToSteamworks = useEffectEvent(() => {
		navigateApp('/loading/steamworks');
	});
	const navigateToInitialSteamworks = useEffectEvent(() => {
		if (!initialSteamworksVerificationRequested && !initializedConfigsRef.current) {
			initialSteamworksVerificationRequested = true;
			navigateToSteamworks();
		}
	});
	const startForcedModReload = useEffectEvent(() => {
		updateAppState({ loadingMods: true, forceReloadMods: true });
	});
	const previewWorkspaceNavigation = useCallback((pathname: string) => {
		if (getAppRouteKind(pathname) !== 'loading') {
			const stageKey = getWorkspaceStageKey(pathname);
			setMountedStages((current) => (current[stageKey] ? current : { ...current, [stageKey]: true }));
			setPreviewPathname(pathname);
		}
	}, []);

	useEffect(() => {
		if (window.electron.uiSmokeMode) {
			return undefined;
		}

		const initialSteamworksTimeoutId = window.setTimeout(() => {
			navigateToInitialSteamworks();
		}, 0);
		const unsubscribeModRefresh = api.onModRefreshRequested(() => {
			startForcedModReload();
		});
		const unsubscribeReloadSteamworks = api.onReloadSteamworks(() => {
			navigateToSteamworks();
		});

		return () => {
			window.clearTimeout(initialSteamworksTimeoutId);
			unsubscribeModRefresh();
			unsubscribeReloadSteamworks();
		};
	}, []);

	useEffect(() => {
		if (committedPathnameRef.current === currentPathname) {
			return;
		}
		committedPathnameRef.current = currentPathname;
		setPreviewPathname(null);
	}, [currentPathname]);

	useLayoutEffect(() => {
		if (appShell.isLoadingRoute) {
			return;
		}

		const stageKey = getWorkspaceStageKey(effectivePathname);
		setMountedStages((current) => (current[stageKey] ? current : { ...current, [stageKey]: true }));
	}, [appShell.isLoadingRoute, effectivePathname]);

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
			<aside className={`AppSidebar${sidebarCollapsed ? ' is-collapsed' : ''}`} aria-label="Workspace navigation">
				<Suspense fallback={null}>
					<MenuBarStageView disableNavigation={appShell.disableNavigation} onWorkspacePreview={previewWorkspaceNavigation} />
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
					<span className="MenuCollapseButtonIcon" key={sidebarCollapsed ? 'collapsed' : 'expanded'} aria-hidden="true">
						{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
					</span>
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
			<AppStateProvider navigate={navigateApp}>
				<AppShell />
				<EffectAtomRendererProof />
				<NotificationViewport />
			</AppStateProvider>
		</div>
	);
}

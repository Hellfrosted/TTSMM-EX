import { Suspense, lazy, useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { App as AntApp, ConfigProvider, Layout } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { AppState } from 'model';
import api from 'renderer/Api';
import ViewStageLoadingFallback from './components/loading/ViewStageLoadingFallback';
import { AppStateProvider, useAppState } from './state/app-state';
import { appCssVariables, appTheme } from './theme';

const { Sider } = Layout;

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

function AppShell() {
	const location = useLocation();
	const appState = useAppState();
	const { launchingGame, sidebarCollapsed, savingConfig, madeConfigEdits, configErrors } = appState;
	const [mountedSettings, setMountedSettings] = useState(location.pathname.startsWith('/settings'));
	const [mountedBlockLookup, setMountedBlockLookup] = useState(location.pathname.startsWith('/block-lookup'));
	const [mountedCollections, setMountedCollections] = useState(
		!location.pathname.includes('/loading') && !location.pathname.startsWith('/settings') && !location.pathname.startsWith('/block-lookup')
	);
	const navigateToSteamworks = useEffectEvent(() => {
		appState.navigate('/loading/steamworks');
	});
	const startForcedModReload = useEffectEvent(() => {
		appState.updateState({ loadingMods: true, forceReloadMods: true });
	});

	useEffect(() => {
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

	const isLoadingRoute = location.pathname.includes('/loading');
	const isSettingsRoute = location.pathname.startsWith('/settings');
	const isBlockLookupRoute = location.pathname.startsWith('/block-lookup');
	const showCollections = !isLoadingRoute && !isSettingsRoute && !isBlockLookupRoute;
	const showSettings = !isLoadingRoute && isSettingsRoute;
	const showBlockLookup = !isLoadingRoute && isBlockLookupRoute;

	useEffect(() => {
		if (isLoadingRoute) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			if (isSettingsRoute) {
				setMountedSettings(true);
				return;
			}

			if (isBlockLookupRoute) {
				setMountedBlockLookup(true);
				return;
			}

			setMountedCollections(true);
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isBlockLookupRoute, isLoadingRoute, isSettingsRoute]);

	return (
		<div style={{ display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
			<Layout style={{ flex: 1, minWidth: 0, minHeight: 0, height: '100%' }}>
				<Sider
					className="MenuBar"
					collapsible
					collapsed={sidebarCollapsed}
					onCollapse={(collapsed) => {
						appState.updateState({ sidebarCollapsed: collapsed });
					}}
				>
					<div className="logo" />
					<Suspense fallback={null}>
						<MenuBarLazy
							disableNavigation={
								launchingGame ||
								location.pathname.includes('loading') ||
								savingConfig ||
								madeConfigEdits ||
								(!!configErrors && Object.keys(configErrors).length > 0)
							}
							appState={appState}
						/>
					</Suspense>
				</Sider>
				<div className="AppViewHost">
					<AppViewStage active={isLoadingRoute} name="loading">
						{isLoadingRoute ? <Outlet context={appState satisfies AppState} /> : null}
					</AppViewStage>
					{mountedCollections && (appState.activeCollection || appState.loadingMods) ? (
						<AppViewStage active={showCollections} name="collections">
							<Suspense
								fallback={
									<ViewStageLoadingFallback
										title="Loading mod workspace"
										detail="Preparing collections, filters, and validation controls."
									/>
								}
							>
								<CollectionViewLazy appState={appState satisfies AppState} />
							</Suspense>
						</AppViewStage>
					) : null}
					{mountedSettings ? (
						<AppViewStage active={showSettings} name="settings" overflow="auto">
							<Suspense
								fallback={
									<ViewStageLoadingFallback
										title="Loading settings"
										detail="Preparing paths, launch options, and logging controls."
									/>
								}
							>
								<SettingsViewLazy appState={appState satisfies AppState} />
							</Suspense>
						</AppViewStage>
					) : null}
					{mountedBlockLookup ? (
						<AppViewStage active={showBlockLookup} name="block-lookup">
							<Suspense
								fallback={
									<ViewStageLoadingFallback
										title="Loading block lookup"
										detail="Preparing the block alias index and search controls."
									/>
								}
							>
								<BlockLookupViewLazy appState={appState satisfies AppState} />
							</Suspense>
						</AppViewStage>
					) : null}
				</div>
			</Layout>
		</div>
	);
}

export default function App() {
	const navigate = useNavigate();
	const navigateApp = useCallback(
		(path: string) => {
			navigate(path);
		},
		[navigate]
	);

	return (
		<div className="AppRoot" style={{ ...appCssVariables, width: '100%', height: '100%' }}>
			<ConfigProvider theme={appTheme}>
				<AntApp>
					<AppStateProvider navigate={navigateApp}>
						<AppShell />
					</AppStateProvider>
				</AntApp>
			</ConfigProvider>
		</div>
	);
}

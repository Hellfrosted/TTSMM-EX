import { useEffect, useEffectEvent, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { App as AntApp, ConfigProvider, Layout } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { AppState } from 'model';
import api from 'renderer/Api';
import MenuBar from './components/MenuBar';
import { AppStateProvider, useAppState } from './state/app-state';
import { appTheme } from './theme';
import { SettingsView } from './views/SettingsView';
import { CollectionView } from './views/CollectionView';

const { Sider } = Layout;

interface AppViewStageProps extends PropsWithChildren {
	active: boolean;
	name: 'loading' | 'collections' | 'settings';
	overflow?: 'auto' | 'hidden';
}

export function AppViewStage({ active, children, name, overflow = 'hidden' }: AppViewStageProps) {
	return (
		<div
			aria-hidden={!active}
			className={`AppViewStage${active ? ' is-active' : ''}`}
			data-active={active ? 'true' : 'false'}
			data-view-stage={name}
			inert={!active}
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
	const [mountedCollections, setMountedCollections] = useState(
		!location.pathname.includes('/loading') && !location.pathname.startsWith('/settings')
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
	const showCollections = !isLoadingRoute && !isSettingsRoute;
	const showSettings = !isLoadingRoute && isSettingsRoute;

	useEffect(() => {
		if (isLoadingRoute) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			if (isSettingsRoute) {
				setMountedSettings(true);
				return;
			}

			setMountedCollections(true);
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isLoadingRoute, isSettingsRoute]);

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
					<MenuBar
						disableNavigation={
							launchingGame ||
							location.pathname.includes('loading') ||
							savingConfig ||
							madeConfigEdits ||
							(!!configErrors && Object.keys(configErrors).length > 0)
						}
						appState={appState}
					/>
				</Sider>
				<div className="AppViewHost">
					<AppViewStage active={isLoadingRoute} name="loading">
						{isLoadingRoute ? <Outlet context={appState satisfies AppState} /> : null}
					</AppViewStage>
					{mountedCollections && (appState.activeCollection || appState.loadingMods) ? (
						<AppViewStage active={showCollections} name="collections">
							<CollectionView appState={appState satisfies AppState} />
						</AppViewStage>
					) : null}
					{mountedSettings ? (
						<AppViewStage active={showSettings} name="settings" overflow="auto">
							<SettingsView appState={appState satisfies AppState} />
						</AppViewStage>
					) : null}
				</div>
			</Layout>
		</div>
	);
}

export default function App() {
	const navigate = useNavigate();

	return (
		<ConfigProvider theme={appTheme}>
			<AntApp>
				<AppStateProvider navigate={navigate}>
					<AppShell />
				</AppStateProvider>
			</AntApp>
		</ConfigProvider>
	);
}

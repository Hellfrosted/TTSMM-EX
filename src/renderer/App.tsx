import { useEffect, useEffectEvent, useState } from 'react';
import { App as AntApp, ConfigProvider, Layout, theme as antdTheme } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { AppState } from 'model';
import api from 'renderer/Api';
import MenuBar from './components/MenuBar';
import { AppStateProvider, useAppState } from './state/app-state';
import { SettingsView } from './views/SettingsView';
import { CollectionView } from './views/CollectionView';

const { Sider } = Layout;

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

		const initialMountTimeout = window.setTimeout(() => {
			if (isSettingsRoute) {
				setMountedSettings(true);
			} else {
				setMountedCollections(true);
			}
		}, 0);

		const warmMountTimeout = window.setTimeout(() => {
			setMountedCollections(true);
			setMountedSettings(true);
		}, 50);

		return () => {
			window.clearTimeout(initialMountTimeout);
			window.clearTimeout(warmMountTimeout);
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
					<div className={`AppViewStage${isLoadingRoute ? ' is-active' : ''}`}>
						{isLoadingRoute ? <Outlet context={appState satisfies AppState} /> : null}
					</div>
					{mountedCollections && (appState.activeCollection || appState.loadingMods) ? (
						<div
							className={`AppViewStage${showCollections ? ' is-active' : ''}`}
							style={{
								overflow: 'hidden'
							}}
						>
							<CollectionView appState={appState satisfies AppState} />
						</div>
					) : null}
					{mountedSettings ? (
						<div
							className={`AppViewStage${showSettings ? ' is-active' : ''}`}
							style={{
								overflow: 'auto'
							}}
						>
							<SettingsView appState={appState satisfies AppState} />
						</div>
					) : null}
				</div>
			</Layout>
		</div>
	);
}

export default function App() {
	const navigate = useNavigate();
	const appTheme = {
		algorithm: antdTheme.darkAlgorithm,
		token: {
			colorPrimary: '#b65b47',
			colorSuccess: '#6d9c6c',
			colorWarning: '#c08a4f',
			colorError: '#b86159',
			colorInfo: '#b65b47',
			colorLink: '#c9735d',
			colorTextBase: '#f2ede6',
			colorBgBase: '#131517',
			colorBgContainer: '#1b1f24',
			colorBgElevated: '#20252b',
			colorBorder: '#2b323a',
			colorSplit: '#222931',
			borderRadius: 8,
			borderRadiusLG: 10,
			borderRadiusSM: 6,
			controlHeight: 34,
			boxShadowSecondary: '0 2px 8px rgba(0, 0, 0, 0.22)'
		},
		components: {
			Layout: {
				headerBg: '#1b1f24',
				siderBg: '#111315',
				bodyBg: '#131517',
				footerBg: '#171a1f',
				triggerBg: '#111315',
				triggerColor: 'rgba(242, 237, 230, 0.72)'
			},
			Menu: {
				darkItemBg: '#111315',
				darkSubMenuItemBg: '#111315',
				darkItemSelectedBg: '#20252b',
				darkItemHoverBg: '#181c21',
				darkItemSelectedColor: '#f2ede6',
				darkItemColor: 'rgba(242, 237, 230, 0.76)',
				itemBorderRadius: 8,
				itemMarginInline: 10
			},
			Button: {
				borderRadius: 8,
				controlHeight: 34,
				paddingInline: 14
			},
			Input: {
				activeBorderColor: '#b65b47',
				hoverBorderColor: '#965141'
			},
			InputNumber: {
				activeBorderColor: '#b65b47',
				hoverBorderColor: '#965141'
			},
			Select: {
				activeBorderColor: '#b65b47',
				hoverBorderColor: '#965141'
			},
			Switch: {
				colorPrimary: '#b65b47',
				colorPrimaryHover: '#c9735d'
			},
			Table: {
				headerBg: '#191d22',
				headerColor: '#efe8df',
				headerBorderRadius: 0,
				rowHoverBg: '#1a2026',
				rowSelectedBg: '#20262d',
				rowSelectedHoverBg: '#242b33',
				borderColor: '#2b323a'
			},
			Tabs: {
				itemActiveColor: '#f2ede6',
				itemColor: 'rgba(242, 237, 230, 0.68)',
				itemHoverColor: '#f2ede6',
				inkBarColor: '#b65b47'
			},
			Modal: {
				contentBg: '#1b1f24',
				headerBg: '#1b1f24',
				titleColor: '#f2ede6'
			},
			Tag: {
				borderRadiusSM: 4,
				defaultBg: '#20252b',
				defaultColor: '#e8e1d7'
			},
			Collapse: {
				headerBg: '#171b20',
				contentBg: '#15191d',
				borderlessContentBg: '#15191d',
				borderlessHeaderBg: '#171b20'
			},
			Descriptions: {
				labelBg: '#171b20'
			}
		}
	};

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

import { startTransition, useCallback, useEffect, useRef } from 'react';
import { Menu } from 'antd';
import type { MenuProps as AntdMenuProps } from 'antd';
import AppstoreOutlined from '@ant-design/icons/es/icons/AppstoreOutlined';
import SearchOutlined from '@ant-design/icons/es/icons/SearchOutlined';
import SettingOutlined from '@ant-design/icons/es/icons/SettingOutlined';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AppState } from 'model';
import api from 'renderer/Api';
import { getStoredViewPath } from 'renderer/util/view-path';

interface MenuProps {
	disableNavigation?: boolean;
	appState: AppState;
}

export default function MenuBar({ disableNavigation, appState }: MenuProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const { config, updateState } = appState;
	const loadModsOnNavigate = !appState.firstModLoad;
	const configRef = useRef(config);
	const persistedPathRef = useRef(config.currentPath);
	const scheduledPersistHandleRef = useRef<number | null>(null);
	const pendingPathRef = useRef<string | null>(null);
	const persistInFlightRef = useRef(false);
	const menuIconStyle = { fontSize: 18, lineHeight: 1 };
	const menuItemStyle = { display: 'flex', alignItems: 'center' };
	const selectedPath = getStoredViewPath(location.pathname);

	useEffect(() => {
		configRef.current = config;
		if (!persistInFlightRef.current && scheduledPersistHandleRef.current === null && pendingPathRef.current === null) {
			persistedPathRef.current = config.currentPath;
		}
	}, [config]);

	const cancelScheduledPersist = useCallback(() => {
		if (scheduledPersistHandleRef.current === null) {
			return;
		}

		if (typeof window.cancelIdleCallback === 'function') {
			window.cancelIdleCallback(scheduledPersistHandleRef.current);
		} else {
			window.clearTimeout(scheduledPersistHandleRef.current);
		}
		scheduledPersistHandleRef.current = null;
	}, []);

	function flushPendingPath() {
		if (persistInFlightRef.current) {
			return;
		}

		const nextPath = pendingPathRef.current;
		if (!nextPath) {
			return;
		}

		pendingPathRef.current = null;
		persistInFlightRef.current = true;
		const rollbackPath = persistedPathRef.current;
		const nextConfig = { ...configRef.current, currentPath: nextPath };
		const persistPath = async () => {
			try {
				const updateSuccess = await api.updateConfig(nextConfig);
				if (!updateSuccess) {
					throw new Error('Config write was rejected');
				}

				persistedPathRef.current = nextPath;
			} catch (error) {
				api.logger.error(error);
				if (configRef.current.currentPath !== nextPath) {
					return;
				}

				const rollbackConfig = { ...configRef.current, currentPath: rollbackPath };
				configRef.current = rollbackConfig;
				startTransition(() => {
					updateState({
						config: rollbackConfig,
						...(loadModsOnNavigate ? { loadingMods: false } : {})
					});
					navigate(rollbackPath);
				});
			} finally {
				persistInFlightRef.current = false;
				if (pendingPathRef.current !== null) {
					flushPendingPath();
				}
			}
		};

		void persistPath();
	}

	function schedulePathPersist(nextPath: string) {
		pendingPathRef.current = nextPath;
		cancelScheduledPersist();
		if (persistInFlightRef.current) {
			return;
		}

		const scheduleFlush = () => {
			scheduledPersistHandleRef.current = null;
			flushPendingPath();
		};

		if (typeof window.requestIdleCallback === 'function') {
			scheduledPersistHandleRef.current = window.requestIdleCallback(scheduleFlush, { timeout: 750 });
			return;
		}

		scheduledPersistHandleRef.current = window.setTimeout(scheduleFlush, 250);
	}

	const items: AntdMenuProps['items'] = [
		{
			key: '/collections/main',
			style: menuItemStyle,
			icon: <AppstoreOutlined style={menuIconStyle} />,
			label: 'Mod Collections'
		},
		{
			key: '/block-lookup',
			style: menuItemStyle,
			icon: <SearchOutlined style={menuIconStyle} />,
			label: 'Block Lookup'
		},
		{
			key: '/settings',
			style: menuItemStyle,
			icon: <SettingOutlined style={menuIconStyle} />,
			label: 'Settings'
		}
	];

	useEffect(() => {
		return () => {
			cancelScheduledPersist();
		};
	}, [cancelScheduledPersist]);

	return (
		<Menu
			id="MenuBar"
			theme="dark"
			className="MenuBar"
			selectedKeys={[selectedPath]}
			mode="inline"
			disabled={disableNavigation}
			items={items}
			onClick={(e) => {
				if (e.key !== selectedPath) {
					const nextConfig = { ...configRef.current, currentPath: e.key };
					configRef.current = nextConfig;
					startTransition(() => {
						updateState({
							config: nextConfig,
							...(loadModsOnNavigate ? { loadingMods: true } : {})
						});
						navigate(e.key);
					});
					schedulePathPersist(e.key);
				}
			}}
		/>
	);
}

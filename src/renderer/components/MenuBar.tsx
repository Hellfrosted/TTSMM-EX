import { startTransition, useEffect, useRef } from 'react';
import { Menu } from 'antd';
import type { MenuProps as AntdMenuProps } from 'antd';
import { AppstoreOutlined, SettingOutlined } from '@ant-design/icons';
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
	const persistPathHandleRef = useRef<number | null>(null);
	const menuIconStyle = { fontSize: 18, lineHeight: 1 };
	const menuItemStyle = { display: 'flex', alignItems: 'center' };
	const selectedPath = getStoredViewPath(location.pathname);

	useEffect(() => {
		configRef.current = config;
	}, [config]);

	const cancelPendingPersist = () => {
		if (persistPathHandleRef.current === null) {
			return;
		}

		if (typeof window.cancelIdleCallback === 'function') {
			window.cancelIdleCallback(persistPathHandleRef.current);
		} else {
			window.clearTimeout(persistPathHandleRef.current);
		}
		persistPathHandleRef.current = null;
	};

	const persistCurrentPath = (nextPath: string) => {
		cancelPendingPersist();
		const persistConfig = () => {
			const nextConfig = { ...configRef.current, currentPath: nextPath };
			void api.updateConfig(nextConfig).then((updateSuccess) => {
				if (!updateSuccess) {
					throw new Error('Config write was rejected');
				}
				return updateSuccess;
			}).catch((error) => {
				api.logger.error(error);
			}).finally(() => {
				persistPathHandleRef.current = null;
			});
		};

		if (typeof window.requestIdleCallback === 'function') {
			persistPathHandleRef.current = window.requestIdleCallback(persistConfig, { timeout: 750 });
			return;
		}

		persistPathHandleRef.current = window.setTimeout(persistConfig, 250);
	};

	const items: AntdMenuProps['items'] = [
		{
			key: '/collections/main',
			style: menuItemStyle,
			icon: <AppstoreOutlined style={menuIconStyle} />,
			label: 'Mod Collections'
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
			cancelPendingPersist();
		};
	}, []);

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
					persistCurrentPath(e.key);
				}
			}}
		/>
	);
}

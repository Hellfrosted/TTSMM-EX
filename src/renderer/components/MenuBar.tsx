import { startTransition, useCallback, useEffect, useRef } from 'react';
import { Grid3X3, Search, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AppConfig, AppState } from 'model';
import api from 'renderer/Api';
import { writeConfig } from 'renderer/util/config-write';
import { getStoredViewPath } from 'renderer/util/view-path';

interface MenuProps {
	disableNavigation?: boolean;
	config: AppConfig;
	firstModLoad: boolean;
	updateState: AppState['updateState'];
}

export default function MenuBar({ config, disableNavigation, firstModLoad, updateState }: MenuProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const loadModsOnNavigate = !firstModLoad;
	const configRef = useRef(config);
	const persistedPathRef = useRef(config.currentPath);
	const scheduledPersistHandleRef = useRef<number | null>(null);
	const pendingPathRef = useRef<string | null>(null);
	const persistInFlightRef = useRef(false);
	const selectedPath = getStoredViewPath(location.pathname);
	const items = [
		{ key: '/collections/main', icon: <Grid3X3 size={18} />, label: 'Mod Collections' },
		{ key: '/block-lookup', icon: <Search size={18} />, label: 'Block Lookup' },
		{ key: '/settings', icon: <Settings size={18} />, label: 'Settings' }
	];

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
				await writeConfig(nextConfig);
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

	useEffect(() => {
		return () => {
			cancelScheduledPersist();
		};
	}, [cancelScheduledPersist]);

	return (
		<nav id="MenuBar" className="MenuBarNav" aria-label="Primary">
			<ul className="MenuBarNavList">
				{items.map((item) => {
					const selected = item.key === selectedPath;
					return (
						<li key={item.key} data-menu-id={item.key} className={`MenuBarNavItem${selected ? ' is-selected' : ''}`}>
							<button
								type="button"
								className="MenuBarNavButton"
								disabled={disableNavigation}
								aria-current={selected ? 'page' : undefined}
								onClick={() => {
									if (item.key === selectedPath) {
										return;
									}

									const nextConfig = { ...configRef.current, currentPath: item.key };
									configRef.current = nextConfig;
									startTransition(() => {
										updateState({
											config: nextConfig,
											...(loadModsOnNavigate ? { loadingMods: true } : {})
										});
										navigate(item.key);
									});
									schedulePathPersist(item.key);
								}}
							>
								<span className="MenuBarNavIcon" aria-hidden="true">
									{item.icon}
								</span>
								<span className="MenuBarNavLabel">{item.label}</span>
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

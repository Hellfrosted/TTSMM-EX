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

const navigationItems = [
	{ key: '/collections/main', icon: <Grid3X3 size={18} />, label: 'Mod Collections' },
	{ key: '/block-lookup', icon: <Search size={18} />, label: 'Block Lookup' },
	{ key: '/settings', icon: <Settings size={18} />, label: 'Settings' }
];

export default function MenuBar({ config, disableNavigation, firstModLoad, updateState }: MenuProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const configRef = useRef(config);
	const persistedPathRef = useRef(config.currentPath);
	const scheduledPersistHandleRef = useRef<number | null>(null);
	const pendingPathRef = useRef<string | null>(null);
	const persistInFlightRef = useRef(false);
	const mountedRef = useRef(true);
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

	const flushPendingPath = useCallback(() => {
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
				if (!mountedRef.current) {
					return;
				}
				persistedPathRef.current = nextPath;
			} catch (error) {
				api.logger.error(error);
				if (!mountedRef.current) {
					return;
				}
				if (pendingPathRef.current !== null) {
					return;
				}

				const rollbackConfig = { ...configRef.current, currentPath: rollbackPath };
				configRef.current = rollbackConfig;
				startTransition(() => {
					updateState({ config: rollbackConfig, loadingMods: false });
					void navigate(rollbackPath);
				});
			} finally {
				persistInFlightRef.current = false;
				if (mountedRef.current && pendingPathRef.current !== null) {
					flushPendingPath();
				}
			}
		};

		void persistPath();
	}, [navigate, updateState]);

	const schedulePathPersist = useCallback(
		(nextPath: string) => {
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
		},
		[cancelScheduledPersist, flushPendingPath]
	);

	const navigateToItem = useCallback(
		(nextPath: string) => {
			if (disableNavigation || nextPath === selectedPath) {
				return;
			}

			const shouldLoadModsOnNavigate = !firstModLoad && nextPath.startsWith('/collections');
			startTransition(() => {
				if (shouldLoadModsOnNavigate) {
					updateState({ loadingMods: true });
				}
				void navigate(nextPath);
			});
			schedulePathPersist(nextPath);
		},
		[disableNavigation, firstModLoad, navigate, schedulePathPersist, selectedPath, updateState]
	);

	useEffect(() => {
		const handleKeyboardNavigation = (event: KeyboardEvent) => {
			if (!event.ctrlKey || event.altKey || event.metaKey || event.key !== 'Tab') {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const currentIndex = Math.max(
				0,
				navigationItems.findIndex((item) => item.key === selectedPath)
			);
			const direction = event.shiftKey ? -1 : 1;
			const nextIndex = (currentIndex + direction + navigationItems.length) % navigationItems.length;
			navigateToItem(navigationItems[nextIndex].key);
		};

		window.addEventListener('keydown', handleKeyboardNavigation, { capture: true });
		return () => {
			window.removeEventListener('keydown', handleKeyboardNavigation, { capture: true });
		};
	}, [navigateToItem, selectedPath]);

	useEffect(() => {
		return () => {
			mountedRef.current = false;
			pendingPathRef.current = null;
			cancelScheduledPersist();
		};
	}, [cancelScheduledPersist]);

	return (
		<nav id="MenuBar" className="MenuBarNav" aria-label="Primary">
			<ul className="MenuBarNavList">
				{navigationItems.map((item) => {
					const selected = item.key === selectedPath;
					return (
						<li key={item.key} data-menu-id={item.key} className={`MenuBarNavItem${selected ? ' is-selected' : ''}`}>
							<button
								type="button"
								className="MenuBarNavButton"
								disabled={disableNavigation}
								aria-current={selected ? 'page' : undefined}
								onClick={() => {
									navigateToItem(item.key);
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

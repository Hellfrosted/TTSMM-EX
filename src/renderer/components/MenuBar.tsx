import { Grid3X3, Search, Settings } from 'lucide-react';
import type { AppConfig, AppState } from 'model';
import { startTransition, useCallback, useEffect, useEffectEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getStoredViewPath } from 'shared/app-route-policy';

interface MenuProps {
	disableNavigation?: boolean;
	config: AppConfig;
	onWorkspacePreview?: (path: string) => void;
	updateState: AppState['updateState'];
}

const navigationItems = [
	{ key: '/collections/main', icon: <Grid3X3 size={18} />, label: 'Mod Collections' },
	{ key: '/block-lookup', icon: <Search size={18} />, label: 'Block Lookup' },
	{ key: '/settings', icon: <Settings size={18} />, label: 'Settings' }
];

export default function MenuBar({ disableNavigation, onWorkspacePreview }: MenuProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const selectedPath = getStoredViewPath(location.pathname);

	const navigateToItem = useCallback(
		(nextPath: string) => {
			if (disableNavigation || nextPath === selectedPath) {
				return;
			}

			onWorkspacePreview?.(nextPath);
			window.setTimeout(() => {
				startTransition(() => {
					void navigate(nextPath);
				});
			}, 0);
		},
		[disableNavigation, navigate, onWorkspacePreview, selectedPath]
	);
	const navigateToKeyboardItem = useEffectEvent((nextPath: string) => {
		navigateToItem(nextPath);
	});

	useEffect(() => {
		const handleKeyboardNavigation = (event: KeyboardEvent) => {
			const target = event.target;
			const isEditableTarget =
				target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
			if (event.defaultPrevented || isEditableTarget || !event.ctrlKey || event.altKey || event.metaKey || event.key !== 'Tab') {
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
			navigateToKeyboardItem(navigationItems[nextIndex].key);
		};

		window.addEventListener('keydown', handleKeyboardNavigation, { capture: true });
		return () => {
			window.removeEventListener('keydown', handleKeyboardNavigation, { capture: true });
		};
	}, [selectedPath]);

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
								title={item.label}
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

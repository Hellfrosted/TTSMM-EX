import { useCallback, useEffect, useRef, useState } from 'react';
import type { Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, ThHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { markPerfInteraction } from 'renderer/perf';
import type { BlockLookupColumnKey, BlockLookupSortDirection, BlockLookupSortKey } from 'renderer/state/block-lookup-store';
import {
	getVirtualTableColumnWidthStyle,
	getVirtualTableColumnWidthVariableName,
	getVirtualTableFixedColumnStyle,
	getVirtualTableScrollWidth,
	setVirtualTableColumnWidthVariable
} from 'renderer/virtual-table-geometry';
import { DEFAULT_BLOCK_LOOKUP_COLUMNS, type BlockLookupColumnConfig } from 'renderer/block-lookup-column-definitions';

const BLOCK_LOOKUP_KEYBOARD_RESIZE_STEP = 16;
const BLOCK_LOOKUP_HEADER_MENU_OPEN_EVENT = 'block-lookup-header-menu-open';
const BLOCK_LOOKUP_HEADER_MENU_ESTIMATED_WIDTH = 196;
const BLOCK_LOOKUP_HEADER_MENU_ESTIMATED_HEIGHT = 180;
const BLOCK_LOOKUP_HEADER_MENU_VIEWPORT_PADDING = 8;
export const BLOCK_LOOKUP_TABLE_PADDING_WIDTH = 32;

const BLOCK_LOOKUP_RESPONSIVE_COLUMN_PRIORITY: BlockLookupColumnKey[] = [
	'blockName',
	'spawnCommand',
	'internalName',
	'modTitle',
	'preview'
];
const BLOCK_LOOKUP_CORE_COLUMN_KEYS = new Set<BlockLookupColumnKey>(['blockName', 'spawnCommand']);
const BLOCK_LOOKUP_FILL_WEIGHTS: Partial<Record<BlockLookupColumnKey, number>> = {
	spawnCommand: 1.5,
	blockName: 1,
	internalName: 1,
	modTitle: 1
};

export function isBlockLookupColumnKey(value: string): value is BlockLookupColumnKey {
	return DEFAULT_BLOCK_LOOKUP_COLUMNS.some((column) => column.key === value);
}

export function resolveBlockLookupColumnWidth(column: BlockLookupColumnConfig) {
	return column.width ?? column.defaultWidth;
}

export function getBlockLookupColumnMinWidth(column: BlockLookupColumnConfig) {
	return Math.max(column.minWidth, Math.ceil(column.title.length * 8 + 34));
}

export function getBlockLookupColumnWidthVariableName(columnKey: string) {
	return getVirtualTableColumnWidthVariableName('block-lookup', columnKey);
}

export function getBlockLookupColumnWidthStyle(columnKey: string, width: number) {
	return getVirtualTableColumnWidthStyle('block-lookup', columnKey, width);
}

export function getBlockLookupVirtualColumnStyle(width: number | string) {
	return getVirtualTableFixedColumnStyle(width);
}

export function getBlockLookupCellAlignment(columnKey: string) {
	return columnKey === 'blockName' ? 'left' : 'center';
}

export function setBlockLookupColumnWidthVariable(container: HTMLElement | null, columnKey: string, width: number) {
	setVirtualTableColumnWidthVariable(container, 'block-lookup', columnKey, width);
}

export function getBlockLookupTableScrollWidth(columns: BlockLookupColumnConfig[]) {
	return getVirtualTableScrollWidth(columns.map(resolveBlockLookupColumnWidth), BLOCK_LOOKUP_TABLE_PADDING_WIDTH);
}

export function getNextBlockLookupSortDirection(
	currentKey: BlockLookupSortKey,
	currentDirection: BlockLookupSortDirection,
	nextKey: BlockLookupColumnKey
) {
	if (currentKey !== nextKey) {
		return 'ascend';
	}
	return currentDirection === 'ascend' ? 'descend' : 'ascend';
}

interface BlockLookupHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
	'data-column-key'?: string;
	headerMenu?: HeaderMenu;
	label?: string;
	width?: number | string;
	resizeWidth?: number;
	minWidth?: number;
	onResize?: (nextWidth: number) => void;
	onResizeEnd?: (nextWidth: number) => void;
}

interface HeaderMenuItem {
	key?: Key;
	label?: ReactNode;
	type?: 'divider';
	disabled?: boolean;
}

interface HeaderMenu {
	items: HeaderMenuItem[];
	onClick: (info: { key: Key }) => void;
}

function getHeaderMenuPosition(x: number, y: number) {
	if (typeof window === 'undefined') {
		return { x, y };
	}

	return {
		x: Math.min(
			Math.max(BLOCK_LOOKUP_HEADER_MENU_VIEWPORT_PADDING, x),
			Math.max(BLOCK_LOOKUP_HEADER_MENU_VIEWPORT_PADDING, window.innerWidth - BLOCK_LOOKUP_HEADER_MENU_ESTIMATED_WIDTH)
		),
		y: Math.min(
			Math.max(BLOCK_LOOKUP_HEADER_MENU_VIEWPORT_PADDING, y),
			Math.max(BLOCK_LOOKUP_HEADER_MENU_VIEWPORT_PADDING, window.innerHeight - BLOCK_LOOKUP_HEADER_MENU_ESTIMATED_HEIGHT)
		)
	};
}

export function BlockLookupHeaderCell({
	headerMenu,
	label,
	width,
	resizeWidth,
	minWidth = 80,
	onResize,
	onResizeEnd,
	children,
	style,
	...rest
}: BlockLookupHeaderCellProps) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const currentResizeWidth = resizeWidth ?? (typeof width === 'number' ? width : minWidth);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const menuOpenerRef = useRef<HTMLElement | null>(null);
	const menuInstanceIdRef = useRef(`block-lookup-header-menu-${Math.random().toString(36).slice(2)}`);
	const resizeHandleRef = useRef<HTMLButtonElement | null>(null);
	const widthRef = useRef(currentResizeWidth);
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
	const resizeLabel = label ?? (typeof rest['data-column-key'] === 'string' ? rest['data-column-key'] : 'column');
	const syncResizeHandleValue = useCallback(
		(nextWidth: number) => {
			widthRef.current = nextWidth;
			const resizeHandle = resizeHandleRef.current;
			if (!resizeHandle) {
				return;
			}

			resizeHandle.setAttribute('aria-valuenow', `${nextWidth}`);
			resizeHandle.setAttribute('aria-valuetext', `${nextWidth}px wide`);
			resizeHandle.setAttribute('aria-valuemax', `${Math.max(minWidth, nextWidth + 1024)}`);
		},
		[minWidth]
	);

	useEffect(() => {
		syncResizeHandleValue(currentResizeWidth);
	}, [currentResizeWidth, syncResizeHandleValue]);

	useEffect(() => {
		return () => {
			cleanupRef.current?.();
		};
	}, []);

	useEffect(() => {
		if (!menuPosition) {
			return undefined;
		}

		const focusFirstMenuItem = window.requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
		});
		const closeMenu = (restoreFocus = true) => {
			setMenuPosition(null);
			if (restoreFocus) {
				menuOpenerRef.current?.focus();
			}
			menuOpenerRef.current = null;
		};
		const closeSiblingMenu = (event: Event) => {
			if (!(event instanceof CustomEvent) || event.detail === menuInstanceIdRef.current) {
				return;
			}

			closeMenu(false);
		};
		const closeMenuFromPointer = () => {
			closeMenu(false);
		};
		const focusMenuItem = (direction: 1 | -1 | 'first' | 'last') => {
			const menuItems = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
			if (menuItems.length === 0) {
				return;
			}
			const activeIndex = menuItems.findIndex((item) => item === document.activeElement);
			if (direction === 'first') {
				menuItems[0].focus();
				return;
			}
			if (direction === 'last') {
				menuItems[menuItems.length - 1].focus();
				return;
			}
			const nextIndex = activeIndex < 0 ? 0 : (activeIndex + direction + menuItems.length) % menuItems.length;
			menuItems[nextIndex].focus();
		};
		const closeMenuOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMenu();
				return;
			}
			if (!menuRef.current?.contains(document.activeElement)) {
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				focusMenuItem(1);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				focusMenuItem(-1);
			} else if (event.key === 'Home') {
				event.preventDefault();
				focusMenuItem('first');
			} else if (event.key === 'End') {
				event.preventDefault();
				focusMenuItem('last');
			} else if (event.key === 'Tab') {
				setMenuPosition(null);
				menuOpenerRef.current = null;
			}
		};

		window.addEventListener('click', closeMenuFromPointer);
		window.addEventListener('contextmenu', closeMenuFromPointer);
		window.addEventListener(BLOCK_LOOKUP_HEADER_MENU_OPEN_EVENT, closeSiblingMenu);
		window.addEventListener('keydown', closeMenuOnEscape);
		return () => {
			window.cancelAnimationFrame(focusFirstMenuItem);
			window.removeEventListener('click', closeMenuFromPointer);
			window.removeEventListener('contextmenu', closeMenuFromPointer);
			window.removeEventListener(BLOCK_LOOKUP_HEADER_MENU_OPEN_EVENT, closeSiblingMenu);
			window.removeEventListener('keydown', closeMenuOnEscape);
		};
	}, [menuPosition]);

	const startResize = useCallback(
		(startX: number) => {
			const startWidth = Math.max(minWidth, widthRef.current || minWidth);
			let nextWidth = startWidth;
			const previousBodyCursor = document.body.style.cursor;
			const previousBodyUserSelect = document.body.style.userSelect;
			markPerfInteraction('blockLookup.columnResize.start', {
				column: resizeLabel,
				width: startWidth
			});

			const updateWidth = (clientX: number) => {
				nextWidth = Math.max(minWidth, Math.round(startWidth + clientX - startX));
				syncResizeHandleValue(nextWidth);
				onResize?.(nextWidth);
			};

			const stopResize = () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				document.body.style.cursor = previousBodyCursor;
				document.body.style.userSelect = previousBodyUserSelect;
				cleanupRef.current = null;
				markPerfInteraction('blockLookup.columnResize.end', {
					column: resizeLabel,
					width: nextWidth
				});
				onResizeEnd?.(nextWidth);
			};

			const handleMouseMove = (event: MouseEvent) => {
				updateWidth(event.clientX);
			};

			const handleMouseUp = () => {
				stopResize();
			};

			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			cleanupRef.current = stopResize;
		},
		[minWidth, onResize, onResizeEnd, resizeLabel, syncResizeHandleValue]
	);

	const handleMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			startResize(event.clientX);
		},
		[startResize]
	);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>) => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const nextWidth = Math.max(minWidth, Math.round((widthRef.current || minWidth) + direction * BLOCK_LOOKUP_KEYBOARD_RESIZE_STEP));
			markPerfInteraction('blockLookup.columnResize.keyboard', {
				column: resizeLabel,
				width: nextWidth
			});
			syncResizeHandleValue(nextWidth);
			onResize?.(nextWidth);
			onResizeEnd?.(nextWidth);
		},
		[minWidth, onResize, onResizeEnd, resizeLabel, syncResizeHandleValue]
	);

	const handleContextMenu = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			if (!headerMenu) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			window.dispatchEvent(new CustomEvent(BLOCK_LOOKUP_HEADER_MENU_OPEN_EVENT, { detail: menuInstanceIdRef.current }));
			menuOpenerRef.current = event.currentTarget;
			setMenuPosition(getHeaderMenuPosition(event.clientX, event.clientY));
		},
		[headerMenu]
	);

	const handleHeaderKeyDownCapture = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (!headerMenu || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			const bounds = event.currentTarget.getBoundingClientRect();
			window.dispatchEvent(new CustomEvent(BLOCK_LOOKUP_HEADER_MENU_OPEN_EVENT, { detail: menuInstanceIdRef.current }));
			menuOpenerRef.current = event.target instanceof HTMLElement ? event.target : event.currentTarget;
			setMenuPosition(getHeaderMenuPosition(bounds.left + 8, bounds.bottom));
		},
		[headerMenu]
	);

	const headerMenuElement =
		headerMenu && menuPosition
			? createPortal(
					<div
						ref={menuRef}
						className="MainCollectionHeaderMenu"
						role="menu"
						aria-label={`${resizeLabel} column options`}
						tabIndex={-1}
						style={{ left: menuPosition.x, top: menuPosition.y }}
					>
						{headerMenu.items.map((item, index) => {
							if (item.type === 'divider') {
								const nextItemKey = headerMenu.items.slice(index + 1).find((nextItem) => nextItem.key !== undefined)?.key;
								const previousItemKey = headerMenu.items
									.slice(0, index)
									.reverse()
									.find((previousItem) => previousItem.key !== undefined)?.key;
								return (
									<hr
										key={`divider-${String(previousItemKey ?? 'start')}-${String(nextItemKey ?? 'end')}`}
										className="MainCollectionHeaderMenuDivider"
									/>
								);
							}

							if (item.key === undefined) {
								return null;
							}

							return (
								<button
									key={item.key.toString()}
									type="button"
									className="MainCollectionHeaderMenuItem"
									role="menuitem"
									disabled={item.disabled}
									onClick={() => {
										headerMenu.onClick({ key: item.key as Key });
										setMenuPosition(null);
										menuOpenerRef.current?.focus();
										menuOpenerRef.current = null;
									}}
								>
									{item.label}
								</button>
							);
						})}
					</div>,
					document.body
				)
			: null;

	return (
		<th {...rest} style={{ ...(style || {}), width, position: 'relative' }}>
			<div className="CollectionTableHeaderInner">
				{headerMenu ? (
					// biome-ignore lint/a11y/noNoninteractiveElementInteractions: this wrapper only exposes the header context menu target.
					// biome-ignore lint/a11y/noStaticElementInteractions: context menu handling is attached to the non-focusable header wrapper.
					<div
						className="CollectionTableHeaderContextTarget"
						onContextMenu={handleContextMenu}
						onKeyDownCapture={handleHeaderKeyDownCapture}
					>
						{children}
					</div>
				) : (
					<div className="CollectionTableHeaderContextTarget">{children}</div>
				)}
				{width ? (
					<button
						type="button"
						ref={resizeHandleRef}
						className="CollectionTableResizeHandle"
						role="slider"
						aria-label={`Resize ${resizeLabel}`}
						aria-orientation="horizontal"
						aria-valuemin={minWidth}
						aria-valuenow={currentResizeWidth}
						aria-valuemax={Math.max(minWidth, currentResizeWidth + 1024)}
						aria-valuetext={`${currentResizeWidth}px wide`}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
						onMouseDown={handleMouseDown}
						onKeyDown={handleKeyDown}
					/>
				) : null}
			</div>
			{headerMenuElement}
		</th>
	);
}

export function getResponsiveBlockLookupColumns(columns: BlockLookupColumnConfig[], availableTableWidth = 0): BlockLookupColumnConfig[] {
	const visibleColumns = columns.filter((column) => column.visible);
	if (availableTableWidth <= 0 || visibleColumns.length <= 1) {
		return visibleColumns;
	}

	const availableColumnWidth = Math.max(0, availableTableWidth - 32);
	const visibleMinWidth = visibleColumns.reduce((totalWidth, column) => totalWidth + getBlockLookupColumnMinWidth(column), 0);
	if (visibleMinWidth <= availableColumnWidth) {
		const columnsWithMinimums = visibleColumns.map((column) => ({
			...column,
			width: Math.max(getBlockLookupColumnMinWidth(column), resolveBlockLookupColumnWidth(column))
		}));
		const visibleConfiguredWidth = columnsWithMinimums.reduce(
			(totalWidth, column) => totalWidth + resolveBlockLookupColumnWidth(column),
			0
		);
		if (visibleConfiguredWidth <= availableColumnWidth) {
			const extraWidth = availableColumnWidth - visibleConfiguredWidth;
			const fillColumns = columnsWithMinimums.filter((column) => BLOCK_LOOKUP_FILL_WEIGHTS[column.key]);
			const totalWeight = fillColumns.reduce((totalWeight, column) => totalWeight + (BLOCK_LOOKUP_FILL_WEIGHTS[column.key] || 0), 0);
			let remainingWidth = extraWidth;
			return columnsWithMinimums.map((column) => {
				const fillIndex = fillColumns.findIndex((fillColumn) => fillColumn.key === column.key);
				if (fillIndex === -1 || totalWeight <= 0) {
					return column;
				}
				const widthShare =
					fillIndex === fillColumns.length - 1
						? remainingWidth
						: Math.floor((extraWidth * (BLOCK_LOOKUP_FILL_WEIGHTS[column.key] || 0)) / totalWeight);
				remainingWidth -= widthShare;
				return { ...column, width: resolveBlockLookupColumnWidth(column) + widthShare };
			});
		}

		let remainingWidth = availableColumnWidth - visibleMinWidth;
		return columnsWithMinimums.map((column) => {
			const minWidth = getBlockLookupColumnMinWidth(column);
			const extraWidth = Math.min(Math.max(0, resolveBlockLookupColumnWidth(column) - minWidth), remainingWidth);
			remainingWidth -= extraWidth;
			return { ...column, width: minWidth + extraWidth };
		});
	}

	const visibleByKey = new Map(visibleColumns.map((column) => [column.key, column]));
	const selectedKeys = new Set<BlockLookupColumnKey>();
	let selectedMinWidth = 0;

	BLOCK_LOOKUP_RESPONSIVE_COLUMN_PRIORITY.forEach((key) => {
		const column = visibleByKey.get(key);
		if (!column || !BLOCK_LOOKUP_CORE_COLUMN_KEYS.has(key)) {
			return;
		}

		selectedKeys.add(key);
		selectedMinWidth += getBlockLookupColumnMinWidth(column);
	});

	if (selectedKeys.size === 0 && visibleColumns[0]) {
		selectedKeys.add(visibleColumns[0].key);
		selectedMinWidth += getBlockLookupColumnMinWidth(visibleColumns[0]);
	}

	BLOCK_LOOKUP_RESPONSIVE_COLUMN_PRIORITY.forEach((key) => {
		const column = visibleByKey.get(key);
		const minWidth = column ? getBlockLookupColumnMinWidth(column) : 0;
		if (!column || selectedKeys.has(key) || selectedMinWidth + minWidth > availableColumnWidth) {
			return;
		}

		selectedKeys.add(key);
		selectedMinWidth += minWidth;
	});

	return visibleColumns.reduce<BlockLookupColumnConfig[]>((columns, column) => {
		if (selectedKeys.has(column.key)) {
			columns.push({ ...column, width: getBlockLookupColumnMinWidth(column) });
		}
		return columns;
	}, []);
}

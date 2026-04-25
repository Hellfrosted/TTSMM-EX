import { useCallback, useEffect, useRef, useState } from 'react';
import type {
	Dispatch,
	DragEvent as ReactDragEvent,
	Key,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactNode,
	RefObject,
	SetStateAction,
	ThHTMLAttributes
} from 'react';
import { MainColumnTitles, getMainColumnMinWidth } from 'model';
import { markPerfInteraction } from 'renderer/perf';
import type { MainSortState } from 'renderer/state/main-collection-table-store';
import {
	DEFAULT_SELECTION_COLUMN_WIDTH,
	getColumnWidthStyle,
	getColumnWidthVariableName,
	isMainColumnTitle,
	setColumnWidthVariable
} from './main-collection-table-layout';

const KEYBOARD_RESIZE_STEP = 16;

export interface MainCollectionHeaderColumn {
	title: string;
	width?: number | string;
	sorter?: unknown;
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

export interface ResizableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
	'data-column-title'?: string;
	headerMenu?: HeaderMenu;
	label?: string;
	width?: number | string;
	resizeWidth?: number;
	minWidth?: number;
	onResize?: (nextWidth: number) => void;
	onResizeEnd?: (nextWidth: number) => void;
}

export function ResizableHeaderCell({
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
}: ResizableHeaderCellProps) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const currentResizeWidth = resizeWidth ?? (typeof width === 'number' ? width : minWidth);
	const resizeHandleRef = useRef<HTMLButtonElement | null>(null);
	const widthRef = useRef(currentResizeWidth);
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
	const resizeLabel = label ?? (typeof rest['data-column-title'] === 'string' ? rest['data-column-title'] : 'column');
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

		const closeMenu = () => {
			setMenuPosition(null);
		};
		const closeMenuOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeMenu();
			}
		};

		window.addEventListener('click', closeMenu);
		window.addEventListener('contextmenu', closeMenu);
		window.addEventListener('keydown', closeMenuOnEscape);
		return () => {
			window.removeEventListener('click', closeMenu);
			window.removeEventListener('contextmenu', closeMenu);
			window.removeEventListener('keydown', closeMenuOnEscape);
		};
	}, [menuPosition]);

	const startResize = useCallback(
		(startX: number) => {
			const startWidth = Math.max(minWidth, widthRef.current || minWidth);
			let nextWidth = startWidth;
			const previousCursor = document.body.style.cursor;
			const previousUserSelect = document.body.style.userSelect;
			markPerfInteraction('collection.columnResize.start', {
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
				document.body.style.cursor = previousCursor;
				document.body.style.userSelect = previousUserSelect;
				cleanupRef.current = null;
				markPerfInteraction('collection.columnResize.end', {
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
			const nextWidth = Math.max(minWidth, Math.round((widthRef.current || minWidth) + direction * KEYBOARD_RESIZE_STEP));
			markPerfInteraction('collection.columnResize.keyboard', {
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
			setMenuPosition({ x: event.clientX, y: event.clientY });
		},
		[headerMenu]
	);

	const headerContent = <div className="CollectionTableHeaderCell">{children}</div>;

	return (
		<th {...rest} style={{ ...(style || {}), width, position: 'relative' }}>
			<div className="CollectionTableHeaderInner">
				{headerMenu ? (
					<div className="CollectionTableHeaderContextTarget" onContextMenu={handleContextMenu}>
						{headerContent}
					</div>
				) : (
					headerContent
				)}
			</div>
			{headerMenu && menuPosition ? (
				<div className="MainCollectionHeaderMenu" role="menu" tabIndex={-1} style={{ left: menuPosition.x, top: menuPosition.y }}>
					{headerMenu.items.map((item, index) => {
						if (item.type === 'divider') {
							return <div key={`divider-${index}`} className="MainCollectionHeaderMenuDivider" role="separator" />;
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
								}}
							>
								{item.label}
							</button>
						);
					})}
				</div>
			) : null}
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
		</th>
	);
}

export function canSetMainColumnVisibility(columnTitle: MainColumnTitles, visible: boolean, columnActiveConfig?: Record<string, boolean>) {
	if (visible) {
		return true;
	}

	if (columnTitle === MainColumnTitles.ID && columnActiveConfig?.[MainColumnTitles.NAME] === false) {
		return false;
	}

	if (columnTitle === MainColumnTitles.NAME && columnActiveConfig?.[MainColumnTitles.ID] === false) {
		return false;
	}

	return true;
}

export function getNextMainCollectionSortState(currentSort: MainSortState, columnTitle: string): MainSortState {
	if (currentSort.columnTitle !== columnTitle) {
		return { columnTitle, order: 'ascend' };
	}

	return {
		columnTitle,
		order: currentSort.order === 'ascend' ? 'descend' : 'ascend'
	};
}

interface MainCollectionHeaderColumnBehaviorOptions {
	columnActiveConfig?: Record<string, boolean>;
	currentWidth: number;
	draggingColumnTitle?: MainColumnTitles;
	hiddenColumnTitles: MainColumnTitles[];
	openMainViewSettingsCallback?: () => void;
	resolvedColumnWidths: Record<string, number>;
	setDraggingColumnTitle: Dispatch<SetStateAction<MainColumnTitles | undefined>>;
	setMainColumnOrderCallback?: (sourceTitle: MainColumnTitles, targetTitle: MainColumnTitles) => unknown;
	setMainColumnVisibilityCallback?: (columnTitle: MainColumnTitles, visible: boolean) => unknown;
	setMainColumnWidthCallback?: (columnTitle: MainColumnTitles, width: number) => unknown;
	tableRootRef: RefObject<HTMLDivElement | null>;
}

export function getMainCollectionHeaderColumnBehavior(columnTitle: MainColumnTitles, options: MainCollectionHeaderColumnBehaviorOptions) {
	const {
		columnActiveConfig,
		currentWidth,
		draggingColumnTitle,
		hiddenColumnTitles,
		openMainViewSettingsCallback,
		resolvedColumnWidths,
		setDraggingColumnTitle,
		setMainColumnOrderCallback,
		setMainColumnVisibilityCallback,
		setMainColumnWidthCallback,
		tableRootRef
	} = options;
	const canHideColumn = canSetMainColumnVisibility(columnTitle, false, columnActiveConfig);
	const contextMenuItems: HeaderMenuItem[] = [
		{
			key: `hide:${columnTitle}`,
			label: `Hide ${columnTitle}`,
			disabled: !canHideColumn
		}
	];

	if (hiddenColumnTitles.length > 0) {
		contextMenuItems.push({
			type: 'divider'
		});
		hiddenColumnTitles.forEach((hiddenColumnTitle) => {
			contextMenuItems.push({
				key: `show:${hiddenColumnTitle}`,
				label: `Show ${hiddenColumnTitle}`
			});
		});
	}

	if (openMainViewSettingsCallback) {
		contextMenuItems.push({
			type: 'divider'
		});
		contextMenuItems.push({
			key: 'view-options',
			label: 'View Options'
		});
	}

	const restorePersistedColumnWidth = () => {
		const persistedWidth = resolvedColumnWidths[columnTitle];
		if (persistedWidth === undefined) {
			tableRootRef.current?.style.removeProperty(getColumnWidthVariableName(columnTitle));
			return;
		}
		setColumnWidthVariable(tableRootRef.current, columnTitle, persistedWidth);
	};

	return {
		width: getColumnWidthStyle(columnTitle, currentWidth),
		onHeaderCell: () => ({
			label: columnTitle,
			'data-column-title': columnTitle,
			width: getColumnWidthStyle(columnTitle, currentWidth),
			resizeWidth: currentWidth,
			minWidth: getMainColumnMinWidth(columnTitle),
			draggable: true,
			className: draggingColumnTitle === columnTitle ? 'is-dragging' : undefined,
			onDragStart: (event: ReactDragEvent<HTMLTableCellElement>) => {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/plain', columnTitle);
				setDraggingColumnTitle(columnTitle);
			},
			onDragOver: (event: ReactDragEvent<HTMLTableCellElement>) => {
				if (draggingColumnTitle && draggingColumnTitle !== columnTitle) {
					event.preventDefault();
					event.dataTransfer.dropEffect = 'move';
				}
			},
			onDrop: (event: ReactDragEvent<HTMLTableCellElement>) => {
				event.preventDefault();
				const sourceTitle = event.dataTransfer.getData('text/plain');
				setDraggingColumnTitle(undefined);
				if (isMainColumnTitle(sourceTitle)) {
					void Promise.resolve(setMainColumnOrderCallback?.(sourceTitle, columnTitle));
				}
			},
			onDragEnd: () => {
				setDraggingColumnTitle(undefined);
			},
			headerMenu: {
				items: contextMenuItems,
				onClick: (info: { key: Key }) => {
					const key = info.key.toString();
					if (key === 'view-options') {
						openMainViewSettingsCallback?.();
						return;
					}

					if (key.startsWith('hide:')) {
						const targetColumn = key.slice('hide:'.length) as MainColumnTitles;
						if (!canSetMainColumnVisibility(targetColumn, false, columnActiveConfig)) {
							return;
						}
						void Promise.resolve(setMainColumnVisibilityCallback?.(targetColumn, false));
						return;
					}

					if (key.startsWith('show:')) {
						const targetColumn = key.slice('show:'.length) as MainColumnTitles;
						void Promise.resolve(setMainColumnVisibilityCallback?.(targetColumn, true));
					}
				}
			},
			onResize: (nextWidth: number) => {
				setColumnWidthVariable(tableRootRef.current, columnTitle, nextWidth);
			},
			onResizeEnd: (nextWidth: number) => {
				setColumnWidthVariable(tableRootRef.current, columnTitle, nextWidth);
				void (async () => {
					try {
						const persisted = await Promise.resolve(setMainColumnWidthCallback?.(columnTitle, nextWidth));
						if (persisted !== false) {
							return;
						}
					} catch {
						// The caller reports write failures separately; this only restores the local preview width.
					}

					restorePersistedColumnWidth();
				})();
			}
		}),
		onCell: () => ({
			'data-column-title': columnTitle,
			style: {
				width: getColumnWidthStyle(columnTitle, currentWidth)
			}
		})
	};
}

interface MainCollectionVirtualHeaderRowProps<TColumn extends MainCollectionHeaderColumn> {
	columns: TColumn[];
	selectionControl: ReactNode;
	sortState: MainSortState;
	sortedRowsCount: number;
	getHeaderCellProps: (column: TColumn) => ResizableHeaderCellProps | undefined;
	isColumnSortable: (column: TColumn) => boolean;
	onSortStateChange: (nextSortState: MainSortState | ((currentSortState: MainSortState) => MainSortState)) => void;
}

export function MainCollectionVirtualHeaderRow<TColumn extends MainCollectionHeaderColumn>({
	columns,
	selectionControl,
	sortState,
	sortedRowsCount,
	getHeaderCellProps,
	isColumnSortable,
	onSortStateChange
}: MainCollectionVirtualHeaderRowProps<TColumn>) {
	return (
		<tr>
			<th className="MainCollectionVirtualSelectionCell" style={{ width: DEFAULT_SELECTION_COLUMN_WIDTH }}>
				{selectionControl}
			</th>
			{columns.map((column) => {
				const headerProps = getHeaderCellProps(column);
				const sortable = isColumnSortable(column);
				const sorted = sortState.columnTitle === column.title;
				const widthStyle = headerProps?.width ?? column.width;
				return (
					<ResizableHeaderCell
						key={column.title}
						{...(headerProps || {})}
						aria-sort={sorted ? (sortState.order === 'ascend' ? 'ascending' : 'descending') : 'none'}
						className={`MainCollectionVirtualHeaderCell ${sortable ? 'is-sortable' : ''} ${sorted ? 'is-sorted' : ''}`}
						style={{ ...(headerProps?.style || {}), width: widthStyle }}
					>
						<button
							type="button"
							className="MainCollectionVirtualHeaderButton"
							disabled={!sortable}
							onClick={() => {
								if (!sortable) {
									return;
								}
								markPerfInteraction('collection.sort', {
									column: column.title,
									rows: sortedRowsCount
								});
								onSortStateChange((currentSort) => getNextMainCollectionSortState(currentSort, column.title));
							}}
						>
							<span>{column.title}</span>
							{sortable ? (
								<span className="MainCollectionVirtualSortIndicator" aria-hidden="true">
									{sorted ? (sortState.order === 'ascend' ? '▲' : '▼') : '↕'}
								</span>
							) : null}
						</button>
					</ResizableHeaderCell>
				);
			})}
		</tr>
	);
}

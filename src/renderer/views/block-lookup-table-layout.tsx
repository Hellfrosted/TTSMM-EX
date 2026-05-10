import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ThHTMLAttributes } from 'react';
import { markPerfInteraction } from 'renderer/perf';
import type { BlockLookupColumnKey, BlockLookupSortDirection, BlockLookupSortKey } from 'renderer/state/block-lookup-store';
import { DEFAULT_BLOCK_LOOKUP_COLUMNS, type BlockLookupColumnConfig } from 'renderer/view-config-persistence';

const BLOCK_LOOKUP_KEYBOARD_RESIZE_STEP = 16;

const BLOCK_LOOKUP_RESPONSIVE_COLUMN_PRIORITY: BlockLookupColumnKey[] = ['spawnCommand', 'blockName', 'modTitle', 'blockId', 'sourceKind'];
const BLOCK_LOOKUP_CORE_COLUMN_KEYS = new Set<BlockLookupColumnKey>(['spawnCommand', 'blockName']);

export function isBlockLookupColumnKey(value: string): value is BlockLookupColumnKey {
	return DEFAULT_BLOCK_LOOKUP_COLUMNS.some((column) => column.key === value);
}

export function resolveBlockLookupColumnWidth(column: BlockLookupColumnConfig) {
	return column.width ?? column.defaultWidth;
}

export function getBlockLookupColumnWidthVariableName(columnKey: string) {
	return `--block-lookup-column-width-${columnKey
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}`;
}

export function getBlockLookupColumnWidthStyle(columnKey: string, width: number) {
	return `var(${getBlockLookupColumnWidthVariableName(columnKey)}, ${width}px)`;
}

export function setBlockLookupColumnWidthVariable(container: HTMLElement | null, columnKey: string, width: number) {
	container?.style.setProperty(getBlockLookupColumnWidthVariableName(columnKey), `${width}px`);
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
	label?: string;
	width?: number | string;
	resizeWidth?: number;
	minWidth?: number;
	onResize?: (nextWidth: number) => void;
	onResizeEnd?: (nextWidth: number) => void;
}

export function BlockLookupHeaderCell({
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
	const resizeHandleRef = useRef<HTMLButtonElement | null>(null);
	const widthRef = useRef(currentResizeWidth);
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

	const startResize = useCallback(
		(startX: number) => {
			const startWidth = Math.max(minWidth, widthRef.current || minWidth);
			let nextWidth = startWidth;
			const previousCursor = document.body.style.cursor;
			const previousUserSelect = document.body.style.userSelect;
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
				document.body.style.cursor = previousCursor;
				document.body.style.userSelect = previousUserSelect;
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

	return (
		<th {...rest} style={{ ...(style || {}), width, position: 'relative' }}>
			<div className="CollectionTableHeaderInner">
				<div className="CollectionTableHeaderContextTarget">{children}</div>
			</div>
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

export function getResponsiveBlockLookupColumns(columns: BlockLookupColumnConfig[], availableTableWidth = 0): BlockLookupColumnConfig[] {
	const visibleColumns = columns.filter((column) => column.visible);
	if (availableTableWidth <= 0 || visibleColumns.length <= 1) {
		return visibleColumns;
	}

	const availableColumnWidth = Math.max(0, availableTableWidth - 32);
	const visibleMinWidth = visibleColumns.reduce((totalWidth, column) => totalWidth + column.minWidth, 0);
	if (visibleMinWidth <= availableColumnWidth) {
		const visibleConfiguredWidth = visibleColumns.reduce((totalWidth, column) => totalWidth + resolveBlockLookupColumnWidth(column), 0);
		if (visibleConfiguredWidth <= availableColumnWidth) {
			return visibleColumns;
		}

		let remainingWidth = availableColumnWidth - visibleMinWidth;
		return visibleColumns.map((column) => {
			const extraWidth = Math.min(Math.max(0, resolveBlockLookupColumnWidth(column) - column.minWidth), remainingWidth);
			remainingWidth -= extraWidth;
			return { ...column, width: column.minWidth + extraWidth };
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
		selectedMinWidth += column.minWidth;
	});

	if (selectedKeys.size === 0 && visibleColumns[0]) {
		selectedKeys.add(visibleColumns[0].key);
		selectedMinWidth += visibleColumns[0].minWidth;
	}

	BLOCK_LOOKUP_RESPONSIVE_COLUMN_PRIORITY.forEach((key) => {
		const column = visibleByKey.get(key);
		if (!column || selectedKeys.has(key) || selectedMinWidth + column.minWidth > availableColumnWidth) {
			return;
		}

		selectedKeys.add(key);
		selectedMinWidth += column.minWidth;
	});

	return visibleColumns.filter((column) => selectedKeys.has(column.key)).map((column) => ({ ...column, width: column.minWidth }));
}

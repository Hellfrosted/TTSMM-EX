import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ThHTMLAttributes } from 'react';
import { Button, Form, Input, InputNumber, Layout, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { useOutletContext } from 'react-router-dom';
import CopyOutlined from '@ant-design/icons/es/icons/CopyOutlined';
import DatabaseOutlined from '@ant-design/icons/es/icons/DatabaseOutlined';
import FolderOutlined from '@ant-design/icons/es/icons/FolderOutlined';
import ReloadOutlined from '@ant-design/icons/es/icons/ReloadOutlined';
import SearchOutlined from '@ant-design/icons/es/icons/SearchOutlined';
import SettingFilled from '@ant-design/icons/es/icons/SettingFilled';
import { BlockLookupColumnTitles, getRows, type AppState, type BlockLookupViewConfig } from 'model';
import type { BlockLookupBuildRequest, BlockLookupModSource, BlockLookupRecord, BlockLookupSettings, BlockLookupIndexStats } from 'shared/block-lookup';
import api from 'renderer/Api';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { writeConfig } from 'renderer/util/config-write';

const { Content, Header } = Layout;
const { Text, Title } = Typography;
const MAX_SEARCH_RESULTS = 1000;
const BLOCK_LOOKUP_TABLE_HEADER_HEIGHT = 48;
const BLOCK_LOOKUP_KEYBOARD_RESIZE_STEP = 16;

type BlockLookupColumnKey = 'spawnCommand' | 'blockName' | 'modTitle' | 'blockId' | 'sourceKind';
type BlockLookupSortKey = 'relevance' | BlockLookupColumnKey;
type BlockLookupSortDirection = 'ascend' | 'descend';
type BlockLookupColumn = NonNullable<TableProps<BlockLookupRecord>['columns']>[number];
const BLOCK_LOOKUP_SORT_DIRECTIONS: NonNullable<TableProps<BlockLookupRecord>['sortDirections']> = ['ascend', 'descend', 'ascend'];

interface BlockLookupColumnConfig {
	key: BlockLookupColumnKey;
	title: BlockLookupColumnTitles;
	visible: boolean;
	width?: number;
	defaultWidth: number;
	minWidth: number;
}

const DEFAULT_BLOCK_LOOKUP_COLUMNS: BlockLookupColumnConfig[] = [
	{ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, visible: true, defaultWidth: 360, minWidth: 180 },
	{ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, visible: true, defaultWidth: 220, minWidth: 120 },
	{ key: 'modTitle', title: BlockLookupColumnTitles.MOD, visible: true, defaultWidth: 200, minWidth: 120 },
	{ key: 'blockId', title: BlockLookupColumnTitles.BLOCK_ID, visible: true, defaultWidth: 110, minWidth: 90 },
	{ key: 'sourceKind', title: BlockLookupColumnTitles.SOURCE, visible: true, defaultWidth: 130, minWidth: 90 }
];
const BLOCK_LOOKUP_RESPONSIVE_COLUMN_PRIORITY: BlockLookupColumnKey[] = ['spawnCommand', 'blockName', 'modTitle', 'blockId', 'sourceKind'];
const BLOCK_LOOKUP_CORE_COLUMN_KEYS = new Set<BlockLookupColumnKey>(['spawnCommand', 'blockName']);
const blockLookupCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const recordKeyCache = new WeakMap<BlockLookupRecord, string>();

interface BlockLookupViewProps {
	appState: AppState;
}

function getRecordKey(record: BlockLookupRecord) {
	const cachedKey = recordKeyCache.get(record);
	if (cachedKey) {
		return cachedKey;
	}
	const key = `${record.sourcePath}:${record.internalName}:${record.blockName}:${record.blockId}`;
	recordKeyCache.set(record, key);
	return key;
}

function formatIndexStatus(stats: BlockLookupIndexStats | null, resultCount: number, query: string) {
	if (!stats) {
		return 'Index not built';
	}

	const searchSuffix = query.trim() ? ` | ${resultCount} match${resultCount === 1 ? '' : 'es'}` : '';
	return `${stats.blocks} indexed block${stats.blocks === 1 ? '' : 's'} from ${stats.sources} source${stats.sources === 1 ? '' : 's'}${searchSuffix}`;
}

function cloneColumnConfig(columns: BlockLookupColumnConfig[]) {
	return columns.map((column) => ({ ...column }));
}

function isBlockLookupColumnKey(value: string): value is BlockLookupColumnKey {
	return DEFAULT_BLOCK_LOOKUP_COLUMNS.some((column) => column.key === value);
}

function getSortValue(record: BlockLookupRecord, sortKey: BlockLookupColumnKey) {
	switch (sortKey) {
		case 'spawnCommand':
			return record.spawnCommand;
		case 'blockName':
			return record.blockName;
		case 'modTitle':
			return record.modTitle;
		case 'blockId':
			return record.blockId;
		case 'sourceKind':
			return record.sourceKind;
		default:
			return '';
	}
}

function compareSortValues(leftValue: string, rightValue: string) {
	const leftNumber = Number(leftValue);
	const rightNumber = Number(rightValue);
	if (leftValue && rightValue && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
		return leftNumber - rightNumber;
	}
	return blockLookupCollator.compare(leftValue, rightValue);
}

function resolveColumnWidth(column: BlockLookupColumnConfig) {
	return Math.max(column.minWidth, column.width ?? column.defaultWidth);
}

function getBlockLookupColumnWidthVariableName(columnKey: string) {
	return `--block-lookup-column-width-${columnKey
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}`;
}

function getBlockLookupColumnWidthStyle(columnKey: string, width: number) {
	return `var(${getBlockLookupColumnWidthVariableName(columnKey)}, ${width}px)`;
}

function setBlockLookupColumnWidthVariable(container: HTMLElement | null, columnKey: string, width: number) {
	container?.style.setProperty(getBlockLookupColumnWidthVariableName(columnKey), `${width}px`);
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

function BlockLookupHeaderCell({
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
		[minWidth, onResize, onResizeEnd, syncResizeHandleValue]
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
			syncResizeHandleValue(nextWidth);
			onResize?.(nextWidth);
			onResizeEnd?.(nextWidth);
		},
		[minWidth, onResize, onResizeEnd, syncResizeHandleValue]
	);

	return (
		<th {...rest} style={{ ...(style || {}), width, position: 'relative' }}>
			<div className="CollectionTableHeaderInner">
				<div className="CollectionTableHeaderContextTarget">
					<div className="BlockLookupTableHeaderCell">{children}</div>
				</div>
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

function moveColumn(columns: BlockLookupColumnConfig[], fromIndex: number, toIndex: number) {
	if (toIndex < 0 || toIndex >= columns.length) {
		return columns;
	}
	const nextColumns = cloneColumnConfig(columns);
	const [column] = nextColumns.splice(fromIndex, 1);
	nextColumns.splice(toIndex, 0, column);
	return nextColumns;
}

function moveColumnByKey(columns: BlockLookupColumnConfig[], fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) {
	const fromIndex = columns.findIndex((column) => column.key === fromKey);
	const toIndex = columns.findIndex((column) => column.key === toKey);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
		return columns;
	}
	return moveColumn(columns, fromIndex, toIndex);
}

function getConfiguredColumns(config?: BlockLookupViewConfig): BlockLookupColumnConfig[] {
	const defaultColumns = cloneColumnConfig(DEFAULT_BLOCK_LOOKUP_COLUMNS);
	const columnByTitle = new Map(defaultColumns.map((column) => [column.title, column]));
	const configuredOrder = config?.columnOrder || [];
	const configuredTitleSet = new Set<BlockLookupColumnTitles>();
	const configuredTitles = configuredOrder.filter((title): title is BlockLookupColumnTitles => {
		if (!columnByTitle.has(title as BlockLookupColumnTitles) || configuredTitleSet.has(title as BlockLookupColumnTitles)) {
			return false;
		}
		configuredTitleSet.add(title as BlockLookupColumnTitles);
		return true;
	});
	const orderedTitles = [
		...configuredTitles,
		...defaultColumns.map((column) => column.title).filter((title) => !configuredTitleSet.has(title))
	];

	return orderedTitles.map((title) => {
		const column = columnByTitle.get(title) ?? defaultColumns[0];
		const configuredWidth = config?.columnWidthConfig?.[title];
		return {
			...column,
			visible: config?.columnActiveConfig?.[title] !== false,
			width: typeof configuredWidth === 'number' ? Math.max(column.minWidth, Math.round(configuredWidth)) : undefined
		};
	});
}

function columnsToConfig(columns: BlockLookupColumnConfig[], smallRows?: boolean): BlockLookupViewConfig {
	const columnActiveConfig = columns.reduce<Record<string, boolean>>((config, column) => {
		if (!column.visible) {
			config[column.title] = false;
		}
		return config;
	}, {});
	const columnWidthConfig = columns.reduce<Record<string, number>>((config, column) => {
		if (typeof column.width === 'number') {
			config[column.title] = Math.max(column.minWidth, Math.round(column.width));
		}
		return config;
	}, {});
	const columnOrder = columns.map((column) => column.title);
	const defaultOrder = DEFAULT_BLOCK_LOOKUP_COLUMNS.map((column) => column.title);

	return {
		smallRows: smallRows || undefined,
		columnActiveConfig: Object.keys(columnActiveConfig).length > 0 ? columnActiveConfig : undefined,
		columnWidthConfig: Object.keys(columnWidthConfig).length > 0 ? columnWidthConfig : undefined,
		columnOrder: columnOrder.some((title, index) => title !== defaultOrder[index]) ? columnOrder : undefined
	};
}

export function getResponsiveBlockLookupColumns(columns: BlockLookupColumnConfig[], availableTableWidth = 0): BlockLookupColumnConfig[] {
	const visibleColumns = columns.filter((column) => column.visible);
	if (availableTableWidth <= 0 || visibleColumns.length <= 1) {
		return visibleColumns;
	}

	const availableColumnWidth = Math.max(0, availableTableWidth - 32);
	const visibleMinWidth = visibleColumns.reduce((totalWidth, column) => totalWidth + column.minWidth, 0);
	if (visibleMinWidth <= availableColumnWidth) {
		const visibleConfiguredWidth = visibleColumns.reduce((totalWidth, column) => totalWidth + resolveColumnWidth(column), 0);
		if (visibleConfiguredWidth <= availableColumnWidth) {
			return visibleColumns;
		}

		let remainingWidth = availableColumnWidth - visibleMinWidth;
		return visibleColumns.map((column) => {
			const extraWidth = Math.min(Math.max(0, resolveColumnWidth(column) - column.minWidth), remainingWidth);
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

function collectBlockLookupModSources(appState: AppState): BlockLookupModSource[] {
	return getRows(appState.mods)
		.filter((modData) => !!modData.path)
		.map((modData) => ({
			uid: modData.uid,
			id: modData.id || undefined,
			name: modData.name,
			path: modData.path,
			workshopID: modData.workshopID?.toString()
		}));
}

async function copyToClipboard(text: string) {
	if (!navigator.clipboard?.writeText) {
		throw new Error('Clipboard access is unavailable in this session.');
	}
	await navigator.clipboard.writeText(text);
}

function BlockLookupViewComponent({ appState }: BlockLookupViewProps) {
	const { openNotification } = useNotifications();
	const [settings, setSettings] = useState<BlockLookupSettings>({ workshopRoot: '' });
	const [workshopRoot, setWorkshopRoot] = useState('');
	const [query, setQuery] = useState('');
	const [rows, setRows] = useState<BlockLookupRecord[]>([]);
	const [stats, setStats] = useState<BlockLookupIndexStats | null>(null);
	const [loadingResults, setLoadingResults] = useState(false);
	const [buildingIndex, setBuildingIndex] = useState(false);
	const [selectedRowKey, setSelectedRowKey] = useState<string>();
	const blockLookupConfig = appState.config.viewConfigs.blockLookup;
	const columnConfig = useMemo(() => getConfiguredColumns(blockLookupConfig), [blockLookupConfig]);
	const [draftColumnConfig, setDraftColumnConfig] = useState<BlockLookupColumnConfig[]>(() => getConfiguredColumns(blockLookupConfig));
	const [draftSmallRows, setDraftSmallRows] = useState(!!blockLookupConfig?.smallRows);
	const [savingTableOptions, setSavingTableOptions] = useState(false);
	const [sortKey, setSortKey] = useState<BlockLookupSortKey>('relevance');
	const [sortDirection, setSortDirection] = useState<BlockLookupSortDirection>('ascend');
	const [tableOptionsOpen, setTableOptionsOpen] = useState(false);
	const [availableTableWidth, setAvailableTableWidth] = useState(0);
	const [availableTableHeight, setAvailableTableHeight] = useState(0);
	const [draggingHeaderColumnKey, setDraggingHeaderColumnKey] = useState<BlockLookupColumnKey>();
	const [draggingDraftColumnKey, setDraggingDraftColumnKey] = useState<BlockLookupColumnKey>();
	const tablePaneRef = useRef<HTMLDivElement | null>(null);
	const syncedColumnKeysRef = useRef<string[]>([]);
	const searchRequestIdRef = useRef(0);
	const modSources = useMemo(() => collectBlockLookupModSources(appState), [appState]);
	const selectedRecord = useMemo(() => rows.find((record) => getRecordKey(record) === selectedRowKey), [rows, selectedRowKey]);
	const sortedRows = useMemo(() => {
		if (sortKey === 'relevance') {
			return rows;
		}
		const directionMultiplier = sortDirection === 'ascend' ? 1 : -1;
		const sortedRecords = [...rows];
		sortedRecords.sort((leftRecord, rightRecord) => {
			const compared = compareSortValues(getSortValue(leftRecord, sortKey), getSortValue(rightRecord, sortKey));
			if (compared !== 0) {
				return compared * directionMultiplier;
			}
			return blockLookupCollator.compare(getRecordKey(leftRecord), getRecordKey(rightRecord));
		});
		return sortedRecords;
	}, [rows, sortDirection, sortKey]);

	const buildRequest = useCallback(
		(forceRebuild = false): BlockLookupBuildRequest => ({
			workshopRoot,
			gameExec: appState.config.gameExec,
			modSources,
			forceRebuild
		}),
		[appState.config.gameExec, modSources, workshopRoot]
	);

	const refreshResults = useCallback(
		async (nextQuery: string) => {
			const requestId = searchRequestIdRef.current + 1;
			searchRequestIdRef.current = requestId;
			setLoadingResults(true);
			try {
				const result = await api.searchBlockLookup({ query: nextQuery, limit: MAX_SEARCH_RESULTS });
				if (requestId !== searchRequestIdRef.current) {
					return;
				}
				setRows(result.rows);
				setStats(result.stats);
				setSelectedRowKey((current) => {
					if (current && result.rows.some((record) => getRecordKey(record) === current)) {
						return current;
					}
					return result.rows[0] ? getRecordKey(result.rows[0]) : undefined;
				});
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Block lookup search failed',
						description: String(error),
						placement: 'topRight',
						duration: 3
					},
					'error'
				);
			} finally {
				if (requestId === searchRequestIdRef.current) {
					setLoadingResults(false);
				}
			}
		},
		[openNotification]
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [nextSettings, nextStats] = await Promise.all([api.readBlockLookupSettings(), api.getBlockLookupStats()]);
				if (cancelled) {
					return;
				}
				setSettings(nextSettings);
				setWorkshopRoot(nextSettings.workshopRoot);
				setStats(nextStats);
				await refreshResults('');
			} catch (error) {
				api.logger.error(error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [refreshResults]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			void refreshResults(query);
		}, 180);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [query, refreshResults]);

	useEffect(() => {
		const tablePane = tablePaneRef.current;
		if (!tablePane) {
			return;
		}

		const syncSize = (nextWidth: number, nextHeight: number) => {
			const roundedWidth = Math.round(nextWidth);
			const roundedHeight = Math.round(nextHeight);
			setAvailableTableWidth((currentWidth) => (currentWidth === roundedWidth ? currentWidth : roundedWidth));
			setAvailableTableHeight((currentHeight) => (currentHeight === roundedHeight ? currentHeight : roundedHeight));
		};

		syncSize(tablePane.clientWidth, tablePane.clientHeight);

		if (typeof ResizeObserver === 'undefined') {
			const handleWindowResize = () => {
				syncSize(tablePane.clientWidth, tablePane.clientHeight);
			};
			window.addEventListener('resize', handleWindowResize);
			return () => {
				window.removeEventListener('resize', handleWindowResize);
			};
		}

		const resizeObserver = new ResizeObserver((entries) => {
			const contentRect = entries[0]?.contentRect;
			syncSize(contentRect?.width ?? tablePane.clientWidth, contentRect?.height ?? tablePane.clientHeight);
		});
		resizeObserver.observe(tablePane);
		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	useEffect(() => {
		const nextColumnKeys = columnConfig.map((column) => column.key);
		const visibleColumnKeys = new Set(nextColumnKeys);
		syncedColumnKeysRef.current.forEach((columnKey) => {
			if (!visibleColumnKeys.has(columnKey as BlockLookupColumnKey)) {
				tablePaneRef.current?.style.removeProperty(getBlockLookupColumnWidthVariableName(columnKey));
			}
		});
		columnConfig.forEach((column) => {
			setBlockLookupColumnWidthVariable(tablePaneRef.current, column.key, resolveColumnWidth(column));
		});
		syncedColumnKeysRef.current = nextColumnKeys;
	}, [columnConfig]);

	const handleSaveSettings = useCallback(async () => {
		try {
			const nextSettings = await api.saveBlockLookupSettings({ workshopRoot });
			setSettings(nextSettings);
			setWorkshopRoot(nextSettings.workshopRoot);
			openNotification(
				{
					message: 'Block lookup path saved',
					description: nextSettings.workshopRoot || 'Workshop root cleared.',
					placement: 'topRight',
					duration: 2
				},
				'success'
			);
		} catch (error) {
			api.logger.error(error);
			openNotification(
				{
					message: 'Could not save block lookup path',
					description: String(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [openNotification, workshopRoot]);

	const handleBrowseWorkshopRoot = useCallback(async () => {
		const selectedPath = await api.selectPath(true, 'Select TerraTech workshop content folder');
		if (selectedPath) {
			setWorkshopRoot(selectedPath);
		}
	}, []);

	const handleAutoDetectWorkshopRoot = useCallback(async () => {
		try {
			const detectedRoot = await api.autoDetectBlockLookupWorkshopRoot(buildRequest(false));
			if (!detectedRoot) {
				openNotification(
					{
						message: 'Workshop root not found',
						description: 'No TerraTech workshop content folder was detected from the loaded mods or Steam libraries.',
						placement: 'topRight',
						duration: 3
					},
					'warn'
				);
				return;
			}
			setWorkshopRoot(detectedRoot);
		} catch (error) {
			api.logger.error(error);
			openNotification(
				{
					message: 'Auto-detect failed',
					description: String(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [buildRequest, openNotification]);

	const handleBuildIndex = useCallback(
		async (forceRebuild = false) => {
			setBuildingIndex(true);
			try {
				const result = await api.buildBlockLookupIndex(buildRequest(forceRebuild));
				setSettings(result.settings);
				setWorkshopRoot(result.settings.workshopRoot);
				setStats(result.stats);
				await refreshResults(query);
				openNotification(
					{
						message: forceRebuild ? 'Block index rebuilt' : 'Block index updated',
						description: `${result.stats.blocks} blocks indexed from ${result.stats.sources} sources.`,
						placement: 'topRight',
						duration: 2
					},
					'success'
				);
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Block index update failed',
						description: String(error),
						placement: 'topRight',
						duration: 4
					},
					'error'
				);
			} finally {
				setBuildingIndex(false);
			}
		},
		[buildRequest, openNotification, query, refreshResults]
	);

	const handleCopySelected = useCallback(async () => {
		if (!selectedRecord) {
			openNotification(
				{
					message: 'No block selected',
					description: 'Select a block command before copying.',
					placement: 'topRight',
					duration: 2
				},
				'warn'
			);
			return;
		}

		try {
			await copyToClipboard(selectedRecord.spawnCommand);
			openNotification(
				{
					message: 'SpawnBlock command copied',
					description: selectedRecord.spawnCommand,
					placement: 'topRight',
					duration: 1.5
				},
				'success'
			);
		} catch (error) {
			openNotification(
				{
					message: 'Could not copy command',
					description: String(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [openNotification, selectedRecord]);

	const handleCopyAll = useCallback(async () => {
		if (sortedRows.length === 0) {
			openNotification(
				{
					message: 'No commands to copy',
					description: 'The current lookup has no results.',
					placement: 'topRight',
					duration: 2
				},
				'warn'
			);
			return;
		}

		try {
			await copyToClipboard(sortedRows.map((record) => record.spawnCommand).join('\n'));
			openNotification(
				{
					message: 'SpawnBlock commands copied',
					description: `${sortedRows.length} command${sortedRows.length === 1 ? '' : 's'} copied.`,
					placement: 'topRight',
					duration: 1.5
				},
				'success'
			);
		} catch (error) {
			openNotification(
				{
					message: 'Could not copy commands',
					description: String(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [openNotification, sortedRows]);

	const openTableOptions = useCallback(() => {
		setDraftColumnConfig(getConfiguredColumns(blockLookupConfig));
		setDraftSmallRows(!!blockLookupConfig?.smallRows);
		setTableOptionsOpen(true);
	}, [blockLookupConfig]);

	const saveTableOptions = useCallback(async () => {
		const nextConfig = cloneAppConfig(appState.config);
		const nextColumns = draftColumnConfig.some((column) => column.visible) ? draftColumnConfig : getConfiguredColumns();
		nextConfig.viewConfigs.blockLookup = columnsToConfig(nextColumns, draftSmallRows);
		setSavingTableOptions(true);
		try {
			await writeConfig(nextConfig);
			appState.updateState({ config: nextConfig });
			setTableOptionsOpen(false);
		} catch (error) {
			api.logger.error(error);
			openNotification(
				{
					message: 'Failed to update view settings',
					description: String(error),
					placement: 'bottomLeft',
					duration: null
				},
				'error'
			);
		} finally {
			setSavingTableOptions(false);
		}
	}, [appState, draftColumnConfig, draftSmallRows, openNotification]);

	const persistColumnOrder = useCallback(
		async (fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) => {
			if (fromKey === toKey) {
				return;
			}

			const nextColumns = moveColumnByKey(columnConfig, fromKey, toKey);
			if (nextColumns === columnConfig) {
				return;
			}

			const nextConfig = cloneAppConfig(appState.config);
			nextConfig.viewConfigs.blockLookup = columnsToConfig(nextColumns, blockLookupConfig?.smallRows);
			try {
				await writeConfig(nextConfig);
				appState.updateState({ config: nextConfig });
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Failed to update column order',
						description: String(error),
						placement: 'bottomLeft',
						duration: null
					},
					'error'
				);
			}
		},
		[appState, blockLookupConfig?.smallRows, columnConfig, openNotification]
	);
	const persistColumnWidth = useCallback(
		async (columnKey: BlockLookupColumnKey, width: number) => {
			const nextColumns = columnConfig.map((column) =>
				column.key === columnKey ? { ...column, width: Math.max(column.minWidth, Math.round(width)) } : column
			);
			const nextConfig = cloneAppConfig(appState.config);
			nextConfig.viewConfigs.blockLookup = columnsToConfig(nextColumns, blockLookupConfig?.smallRows);
			try {
				await writeConfig(nextConfig);
				appState.updateState({ config: nextConfig });
				return true;
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Failed to update column width',
						description: String(error),
						placement: 'bottomLeft',
						duration: null
					},
					'error'
				);
				return false;
			}
		},
		[appState, blockLookupConfig?.smallRows, columnConfig, openNotification]
	);

	const handleTableChange = useCallback<NonNullable<TableProps<BlockLookupRecord>['onChange']>>((_pagination, _filters, sorter) => {
		const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter;
		const columnKey = nextSorter?.columnKey;
		if (typeof columnKey === 'string' && isBlockLookupColumnKey(columnKey) && nextSorter.order) {
			startTransition(() => {
				setSortKey(columnKey);
				setSortDirection(nextSorter.order === 'descend' ? 'descend' : 'ascend');
			});
			return;
		}
		startTransition(() => {
			setSortKey('relevance');
			setSortDirection('ascend');
		});
	}, []);

	const columnDefinitions = useMemo<Record<BlockLookupColumnKey, BlockLookupColumn>>(
		() => ({
			spawnCommand: {
				title: 'SpawnBlock Command',
				dataIndex: 'spawnCommand',
				key: 'spawnCommand',
				ellipsis: true,
				sorter: true,
				sortOrder: sortKey === 'spawnCommand' ? sortDirection : null,
				render: (value: string) => <span className="BlockLookupCommand">{value}</span>
			},
			blockName: {
				title: 'Block',
				dataIndex: 'blockName',
				key: 'blockName',
				sorter: true,
				sortOrder: sortKey === 'blockName' ? sortDirection : null,
				ellipsis: true
			},
			modTitle: {
				title: 'Mod',
				dataIndex: 'modTitle',
				key: 'modTitle',
				sorter: true,
				sortOrder: sortKey === 'modTitle' ? sortDirection : null,
				ellipsis: true
			},
			blockId: {
				title: 'Block ID',
				dataIndex: 'blockId',
				key: 'blockId',
				sorter: true,
				sortOrder: sortKey === 'blockId' ? sortDirection : null,
				ellipsis: true,
				render: (value: string) => value || <Text type="secondary">Not declared</Text>
			},
			sourceKind: {
				title: 'Source',
				dataIndex: 'sourceKind',
				key: 'sourceKind',
				sorter: true,
				sortOrder: sortKey === 'sourceKind' ? sortDirection : null,
				render: (value: BlockLookupRecord['sourceKind']) => <Tag>{value}</Tag>
			}
		}),
		[sortDirection, sortKey]
	);

	const columns = useMemo<TableProps<BlockLookupRecord>['columns']>(
		() =>
			getResponsiveBlockLookupColumns(columnConfig, availableTableWidth)
				.map((column) => {
					const resolvedWidth = resolveColumnWidth(column);
					const widthStyle = getBlockLookupColumnWidthStyle(column.key, resolvedWidth);
					const restorePersistedColumnWidth = () => {
						setBlockLookupColumnWidthVariable(tablePaneRef.current, column.key, resolvedWidth);
					};
					return {
						...columnDefinitions[column.key],
						title: <span className="BlockLookupTableHeaderLabel">{columnDefinitions[column.key].title as string}</span>,
						width: widthStyle,
						onHeaderCell: () =>
							({
								label: column.title,
								draggable: true,
								'data-column-key': column.key,
								className: draggingHeaderColumnKey === column.key ? 'BlockLookupTableHeaderCell is-dragging' : 'BlockLookupTableHeaderCell',
								width: widthStyle,
								resizeWidth: resolvedWidth,
								minWidth: column.minWidth,
								onDragStart: (event) => {
									event.dataTransfer.effectAllowed = 'move';
									event.dataTransfer.setData('text/plain', column.key);
									setDraggingHeaderColumnKey(column.key);
								},
								onDragOver: (event) => {
									if (draggingHeaderColumnKey && draggingHeaderColumnKey !== column.key) {
										event.preventDefault();
										event.dataTransfer.dropEffect = 'move';
									}
								},
								onDrop: (event) => {
									event.preventDefault();
									const sourceKey = event.dataTransfer.getData('text/plain') as BlockLookupColumnKey;
									setDraggingHeaderColumnKey(undefined);
									if (isBlockLookupColumnKey(sourceKey)) {
										void persistColumnOrder(sourceKey, column.key);
									}
								},
								onDragEnd: () => {
									setDraggingHeaderColumnKey(undefined);
								},
								onResize: (nextWidth: number) => {
									setBlockLookupColumnWidthVariable(tablePaneRef.current, column.key, nextWidth);
								},
								onResizeEnd: (nextWidth: number) => {
									setBlockLookupColumnWidthVariable(tablePaneRef.current, column.key, nextWidth);
									void (async () => {
										const persisted = await persistColumnWidth(column.key, nextWidth);
										if (!persisted) {
											restorePersistedColumnWidth();
										}
									})();
								}
							}) as ReturnType<NonNullable<BlockLookupColumn['onHeaderCell']>>,
						onCell: () =>
							({
								'data-column-key': column.key,
								style: {
									width: widthStyle
								}
							}) as ReturnType<NonNullable<BlockLookupColumn['onCell']>>
					};
			}),
		[availableTableWidth, columnConfig, columnDefinitions, draggingHeaderColumnKey, persistColumnOrder, persistColumnWidth]
	);

	const tableScrollX = useMemo(() => {
		const visibleColumnWidth = getResponsiveBlockLookupColumns(columnConfig, availableTableWidth).reduce(
			(totalWidth, column) => totalWidth + resolveColumnWidth(column),
			0
		);
		return Math.max(visibleColumnWidth, availableTableWidth);
	}, [availableTableWidth, columnConfig]);
	const tableScrollY = useMemo(() => Math.max(240, availableTableHeight - BLOCK_LOOKUP_TABLE_HEADER_HEIGHT), [availableTableHeight]);
	const handleRow = useCallback(
		(record: BlockLookupRecord) => ({
			onClick: () => {
				setSelectedRowKey(getRecordKey(record));
			},
			onDoubleClick: () => {
				setSelectedRowKey(getRecordKey(record));
				void copyToClipboard(record.spawnCommand).catch((error) => {
					openNotification(
						{
							message: 'Could not copy command',
							description: String(error),
							placement: 'topRight',
							duration: 3
						},
						'error'
					);
				});
			}
		}),
		[openNotification]
	);

	return (
		<Layout className="BlockLookupViewLayout">
			<Header className="BlockLookupHeader">
				<div className="BlockLookupToolbar">
					<Input
						aria-label="Search block aliases"
						className="BlockLookupSearch"
						prefix={<SearchOutlined />}
						placeholder="Search block, mod, ID, alias"
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
						}}
						allowClear
					/>
					<Space align="center" size={10} wrap className="BlockLookupActions">
						<Button
							icon={<ReloadOutlined />}
							onClick={() => {
								void refreshResults(query);
							}}
							loading={loadingResults}
						>
							Refresh
						</Button>
						<Button
							type="primary"
							icon={<DatabaseOutlined />}
							onClick={() => {
								void handleBuildIndex(false);
							}}
							loading={buildingIndex}
						>
							Update Index
						</Button>
						<Button
							icon={<DatabaseOutlined />}
							onClick={() => {
								void handleBuildIndex(true);
							}}
							disabled={buildingIndex}
						>
							Full Rebuild
						</Button>
						<Button icon={<CopyOutlined />} onClick={handleCopySelected}>
							Copy Selected
						</Button>
						<Button icon={<CopyOutlined />} onClick={handleCopyAll}>
							Copy All
						</Button>
						<Button icon={<SettingFilled />} onClick={openTableOptions}>
							Table Options
						</Button>
					</Space>
				</div>
				<div className="BlockLookupPathBar">
					<Input
						aria-label="Workshop root"
						value={workshopRoot}
						onChange={(event) => {
							setWorkshopRoot(event.target.value);
						}}
						placeholder="TerraTech workshop content folder"
					/>
					<Button aria-label="Browse for workshop root" icon={<FolderOutlined />} onClick={handleBrowseWorkshopRoot} />
					<Button onClick={handleAutoDetectWorkshopRoot}>Auto Detect</Button>
					<Button disabled={settings.workshopRoot === workshopRoot} onClick={handleSaveSettings}>
						Save Path
					</Button>
				</div>
				<div className="BlockLookupStatus" aria-live="polite">
					<Text>{formatIndexStatus(stats, rows.length, query)}</Text>
					<Text type="secondary">{modSources.length} loaded mod source{modSources.length === 1 ? '' : 's'} available</Text>
				</div>
			</Header>
			<Content className="BlockLookupContent">
				<div ref={tablePaneRef} className="BlockLookupTablePane">
					<Table
						className="BlockLookupTable"
						size={blockLookupConfig?.smallRows ? 'small' : 'middle'}
						rowKey={getRecordKey}
						components={{ header: { cell: BlockLookupHeaderCell } }}
						columns={columns}
						dataSource={sortedRows}
						loading={loadingResults || buildingIndex}
						pagination={false}
						scroll={{ x: tableScrollX, y: tableScrollY }}
						sortDirections={BLOCK_LOOKUP_SORT_DIRECTIONS}
						sticky
						tableLayout="fixed"
						virtual
						onChange={handleTableChange}
						rowClassName={(record) =>
							`${blockLookupConfig?.smallRows ? 'CompactBlockLookupRow' : ''}${getRecordKey(record) === selectedRowKey ? ' is-selected' : ''}`.trim()
						}
						onRow={handleRow}
					/>
				</div>
				<div className="BlockLookupDetailsPane">
					{selectedRecord ? (
						<div className="BlockLookupDetailsGrid">
							<div>
								<Text type="secondary">Command</Text>
								<Text copyable className="BlockLookupDetailsValue">
									{selectedRecord.spawnCommand}
								</Text>
							</div>
							<div>
								<Text type="secondary">Fallback</Text>
								<Text copyable className="BlockLookupDetailsValue">
									{selectedRecord.fallbackSpawnCommand}
								</Text>
							</div>
							<div>
								<Text type="secondary">Block</Text>
								<Text className="BlockLookupDetailsValue">{selectedRecord.blockName}</Text>
							</div>
							<div>
								<Text type="secondary">Internal</Text>
								<Text className="BlockLookupDetailsValue">{selectedRecord.internalName}</Text>
							</div>
							<div>
								<Text type="secondary">Mod</Text>
								<Text className="BlockLookupDetailsValue">{selectedRecord.modTitle}</Text>
							</div>
							<div>
								<Text type="secondary">Workshop ID</Text>
								<Text className="BlockLookupDetailsValue">{selectedRecord.workshopId}</Text>
							</div>
							<div className="BlockLookupDetailsGrid__source">
								<Text type="secondary">Source</Text>
								<Text className="BlockLookupDetailsValue">{selectedRecord.sourcePath}</Text>
							</div>
						</div>
					) : (
						<Text type="secondary">No block selected</Text>
					)}
				</div>
			</Content>
			<Modal
				className="CollectionSettingsModal"
				wrapClassName="CollectionSettingsModalWrap"
				title="Block lookup table options"
				width={760}
				open={tableOptionsOpen}
				onCancel={() => {
					setTableOptionsOpen(false);
				}}
				footer={[
					<Button
						key="cancel-settings"
						disabled={savingTableOptions}
						onClick={() => {
							setTableOptionsOpen(false);
						}}
					>
						Cancel
					</Button>,
					<Button
						key="save-settings"
						loading={savingTableOptions}
						disabled={savingTableOptions}
						type="primary"
						onClick={() => {
							void saveTableOptions();
						}}
					>
						Save Table Settings
					</Button>
				]}
			>
				<Form className="CollectionSettingsForm CollectionSettingsForm--dense">
					<div className="CollectionSettingsTopBar">
						<div className="CollectionSettingsTopCopy">
							<Title level={5}>Table layout</Title>
						</div>
						<div className="CollectionSettingsToggleCard">
							<div className="CollectionSettingsToggleCopy">
								<Text strong>Compact rows</Text>
							</div>
							<Switch
								aria-label="Use extra-compact rows in the block lookup table"
								checked={draftSmallRows}
								onChange={(checked) => {
									setDraftSmallRows(checked);
								}}
							/>
						</div>
					</div>
					<div className="CollectionSettingsColumnsHeader BlockLookupSettingsColumnsHeader" aria-hidden>
						<div className="CollectionSettingsColumnsHeaderGroup">
							<Text type="secondary">Column</Text>
							<Text type="secondary">Show</Text>
							<Text type="secondary">Saved width</Text>
						</div>
					</div>
					<div className="CollectionSettingsColumnsList BlockLookupSettingsColumnsList">
						{draftColumnConfig.map((column) => {
							const visibleColumns = draftColumnConfig.filter((draftColumn) => draftColumn.visible).length;
							const cannotHide = column.visible && visibleColumns <= 1;
							return (
								<div
									className={`CollectionSettingsColumnRow BlockLookupSettingsColumnRow${draggingDraftColumnKey === column.key ? ' is-dragging' : ''}`}
									key={column.key}
									draggable
									onDragStart={(event) => {
										event.dataTransfer.effectAllowed = 'move';
										event.dataTransfer.setData('text/plain', column.key);
										setDraggingDraftColumnKey(column.key);
									}}
									onDragOver={(event) => {
										if (draggingDraftColumnKey && draggingDraftColumnKey !== column.key) {
											event.preventDefault();
											event.dataTransfer.dropEffect = 'move';
										}
									}}
									onDrop={(event) => {
										event.preventDefault();
										const sourceKey = event.dataTransfer.getData('text/plain') as BlockLookupColumnKey;
										setDraggingDraftColumnKey(undefined);
										if (isBlockLookupColumnKey(sourceKey)) {
											setDraftColumnConfig((currentColumns) => moveColumnByKey(currentColumns, sourceKey, column.key));
										}
									}}
									onDragEnd={() => {
										setDraggingDraftColumnKey(undefined);
									}}
								>
									<div className="CollectionSettingsColumnLabel">
										<Text strong>{column.title}</Text>
									</div>
									<div className="CollectionSettingsColumnSwitch">
										<Switch
											aria-label={`Show ${column.title} column`}
											checked={column.visible}
											disabled={cannotHide}
											onChange={(checked) => {
												setDraftColumnConfig((currentColumns) =>
													currentColumns.map((currentColumn) =>
														currentColumn.key === column.key ? { ...currentColumn, visible: checked } : currentColumn
													)
												);
											}}
										/>
									</div>
									<div className="CollectionSettingsColumnWidth">
										<InputNumber
											aria-label={`Saved width for ${column.title} column`}
											min={column.minWidth}
											max={720}
											step={10}
											style={{ width: '100%' }}
											value={column.width}
											placeholder={`Auto (${column.minWidth}px min)`}
											disabled={!column.visible}
											onChange={(value) => {
												setDraftColumnConfig((currentColumns) =>
													currentColumns.map((currentColumn) => {
														if (currentColumn.key !== column.key) {
															return currentColumn;
														}
														return { ...currentColumn, width: typeof value === 'number' ? value : undefined };
													})
												);
											}}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</Form>
			</Modal>
		</Layout>
	);
}

export const BlockLookupView = memo(BlockLookupViewComponent);

export default function BlockLookupRoute() {
	return <BlockLookupView appState={useOutletContext<AppState>()} />;
}

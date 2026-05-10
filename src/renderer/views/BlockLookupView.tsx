import {
	Profiler,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type Key,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	type SetStateAction
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Copy, Database, Folder, RefreshCw, Search, Settings2, X } from 'lucide-react';
import type { AppState } from 'model';
import type { BlockLookupIndexStats, BlockLookupRecord } from 'shared/block-lookup';
import { formatBlockLookupIndexStatus, getBlockLookupRecordKey, sortBlockLookupRecords } from 'renderer/block-lookup-workspace';
import {
	DesktopButton as BlockLookupButton,
	DesktopDialog,
	DesktopIconButton,
	DesktopInput,
	DesktopSwitch
} from 'renderer/components/DesktopControls';
import { VirtualTableBody, VirtualTableRow } from 'renderer/components/virtual-table-primitives';
import { logProfilerRender, markPerfInteraction, measurePerf } from 'renderer/perf';
import { useBlockLookupStore, type BlockLookupColumnKey } from 'renderer/state/block-lookup-store';
import { formatErrorMessage } from 'renderer/util/error-message';
import {
	createBlockLookupTableOptionsDraft,
	getBlockLookupDraftColumnStates,
	getConfiguredBlockLookupColumns,
	moveBlockLookupColumnByKey,
	setBlockLookupDraftColumnVisibility,
	setBlockLookupDraftColumnWidth,
	type BlockLookupColumnConfig
} from 'renderer/view-config-persistence';
import { useViewConfigCommands } from 'renderer/view-config-command';
import {
	BlockLookupHeaderCell,
	getBlockLookupColumnMinWidth,
	getBlockLookupColumnWidthStyle,
	getBlockLookupCellAlignment,
	getBlockLookupTableScrollWidth,
	getBlockLookupVirtualColumnStyle,
	getNextBlockLookupSortDirection,
	getResponsiveBlockLookupColumns,
	isBlockLookupColumnKey,
	resolveBlockLookupColumnWidth,
	setBlockLookupColumnWidthVariable
} from './block-lookup-table-layout';
import { useBlockLookupWorkflow } from './use-block-lookup-workflow';

type BlockLookupViewAppState = Pick<AppState, 'config' | 'mods' | 'updateState'>;

interface BlockLookupViewProps {
	appState: BlockLookupViewAppState;
}

const blockLookupToolbarRowClassName = 'BlockLookupToolbarRow flex min-w-0 items-center gap-2.5 max-[760px]:flex-wrap';
const blockLookupSearchControlClassName =
	'min-w-70 max-w-160 flex-[1_1_42rem] max-[760px]:min-w-0 max-[760px]:max-w-none max-[760px]:basis-full';
const blockLookupPathControlClassName = 'min-w-80 flex-[1_1_34rem] max-[760px]:min-w-0 max-[760px]:basis-full';
const blockLookupActionGroupClassName =
	'inline-flex shrink-0 flex-wrap items-center gap-2 max-[760px]:w-full max-[760px]:[&>button]:flex-1';
const blockLookupIndexActionGroupClassName =
	'inline-flex shrink-0 flex-wrap items-center gap-2 max-[960px]:col-span-2 max-[960px]:w-full max-[960px]:[&>button]:flex-1 max-[760px]:col-span-1';
const blockLookupColumnMoveButtonClassName = 'h-(--app-compact-icon-button-size) w-(--app-compact-icon-button-size) shrink-0';
const blockLookupIndexSourceClassName =
	'BlockLookupIndexSource grid min-w-0 grid-cols-[auto_minmax(16rem,1fr)_auto] items-center gap-x-2.5 gap-y-2 border-t border-border pt-3 max-[960px]:grid-cols-[auto_minmax(0,1fr)] max-[760px]:grid-cols-1';

interface BlockLookupViewLocalState {
	availableTableWidth: number;
	draftColumnConfig: BlockLookupColumnConfig[];
	draftSmallRows: boolean;
	draggingDraftColumnKey?: BlockLookupColumnKey;
	draggingHeaderColumnKey?: BlockLookupColumnKey;
	savingTableOptions: boolean;
	tableOptionsOpen: boolean;
}

type BlockLookupViewLocalAction =
	| { type: 'available-table-width-changed'; width: number }
	| { type: 'table-options-opened'; draft: { columns: BlockLookupColumnConfig[]; smallRows: boolean } }
	| { type: 'table-options-closed' }
	| { type: 'saving-table-options-changed'; saving: boolean }
	| { type: 'draft-small-rows-changed'; smallRows: boolean }
	| { type: 'draft-column-config-changed'; updater: SetStateAction<BlockLookupColumnConfig[]> }
	| { type: 'dragging-header-column-changed'; columnKey?: BlockLookupColumnKey }
	| { type: 'dragging-draft-column-changed'; columnKey?: BlockLookupColumnKey };

function reduceBlockLookupViewLocalState(state: BlockLookupViewLocalState, action: BlockLookupViewLocalAction): BlockLookupViewLocalState {
	switch (action.type) {
		case 'available-table-width-changed':
			return state.availableTableWidth === action.width ? state : { ...state, availableTableWidth: action.width };
		case 'table-options-opened':
			return {
				...state,
				draftColumnConfig: action.draft.columns,
				draftSmallRows: action.draft.smallRows,
				tableOptionsOpen: true
			};
		case 'table-options-closed':
			return {
				...state,
				tableOptionsOpen: false
			};
		case 'saving-table-options-changed':
			return {
				...state,
				savingTableOptions: action.saving
			};
		case 'draft-small-rows-changed':
			return {
				...state,
				draftSmallRows: action.smallRows
			};
		case 'draft-column-config-changed': {
			const nextConfig = typeof action.updater === 'function' ? action.updater(state.draftColumnConfig) : action.updater;
			return {
				...state,
				draftColumnConfig: nextConfig
			};
		}
		case 'dragging-header-column-changed':
			return {
				...state,
				draggingHeaderColumnKey: action.columnKey
			};
		case 'dragging-draft-column-changed':
			return {
				...state,
				draggingDraftColumnKey: action.columnKey
			};
	}
}

async function copyToClipboard(text: string) {
	if (!navigator.clipboard?.writeText) {
		throw new Error('Clipboard access is unavailable in this session.');
	}
	await navigator.clipboard.writeText(text);
}

interface BlockLookupSwitchProps {
	'aria-label': string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}

interface BlockLookupNumberInputProps {
	'aria-label': string;
	disabled?: boolean;
	max?: number;
	min: number;
	onChange: (value?: number) => void;
	placeholder: string;
	step: number;
	value?: number;
}

interface BlockLookupTableOptionsModalProps {
	children: ReactNode;
	footer: ReactNode;
	onCancel: () => void;
}

function BlockLookupSwitch({ checked, disabled, onChange, ...props }: BlockLookupSwitchProps) {
	return (
		<DesktopSwitch
			{...props}
			className="m-0"
			checked={checked}
			disabled={disabled}
			onChange={(event) => {
				onChange(event.target.checked);
			}}
			role="switch"
			type="checkbox"
		/>
	);
}

function BlockLookupNumberInput({ disabled, max, min, onChange, placeholder, step, value, ...props }: BlockLookupNumberInputProps) {
	return (
		<DesktopInput
			{...props}
			className="w-full px-2.75 outline-none"
			disabled={disabled}
			max={max}
			min={min}
			onChange={(event) => {
				const nextValue = event.target.valueAsNumber;
				onChange(Number.isFinite(nextValue) ? nextValue : undefined);
			}}
			placeholder={placeholder}
			step={step}
			type="number"
			value={value ?? ''}
		/>
	);
}

function BlockLookupModHeaderFilter({
	availableMods,
	onSelectedModsChange,
	selectedMods
}: {
	availableMods: string[];
	onSelectedModsChange: (mods: string[]) => void;
	selectedMods: string[];
}) {
	const selectedModSet = new Set(selectedMods);
	const unselectedMods = availableMods.filter((mod) => !selectedModSet.has(mod));
	const selectedLabel = selectedMods.length > 0 ? `${selectedMods.length} active` : 'Filter';

	return (
		<select
			className="MainCollectionTagHeaderFilter BlockLookupModHeaderFilter"
			aria-label="Filter Mod column"
			value=""
			disabled={selectedMods.length === 0 && unselectedMods.length === 0}
			onClick={(event) => {
				event.stopPropagation();
			}}
			onMouseDown={(event) => {
				event.stopPropagation();
			}}
			onChange={(event) => {
				const selectedValue = event.target.value;
				if (selectedValue === 'clear:') {
					onSelectedModsChange([]);
				} else if (selectedValue.startsWith('add:')) {
					onSelectedModsChange([...selectedMods, selectedValue.slice('add:'.length)]);
				} else if (selectedValue.startsWith('remove:')) {
					const mod = selectedValue.slice('remove:'.length);
					onSelectedModsChange(selectedMods.filter((selectedMod) => selectedMod !== mod));
				}
				event.currentTarget.value = '';
			}}
		>
			<option value="">{selectedLabel}</option>
			{selectedMods.length > 0 ? <option value="clear:">Clear mod filters</option> : null}
			{selectedMods.map((mod) => (
				<option key={`remove:${mod}`} value={`remove:${mod}`}>
					Remove {mod}
				</option>
			))}
			{unselectedMods.map((mod) => (
				<option key={`add:${mod}`} value={`add:${mod}`}>
					{mod}
				</option>
			))}
		</select>
	);
}

function BlockLookupTableOptionsModal({ children, footer, onCancel }: BlockLookupTableOptionsModalProps) {
	return (
		<DesktopDialog
			open
			title="Block lookup table settings"
			titleClassName="text-subheading font-bold"
			closeLabel="Close modal"
			onCancel={onCancel}
			overlayClassName="p-6"
			panelClassName="max-h-[calc(100vh-48px)] w-[min(920px,calc(100vw-32px))] max-w-[calc(100vw-32px)]"
			bodyClassName="pb-3 pt-2.5"
			footer={footer}
		>
			<div className="w-full min-w-0">{children}</div>
		</DesktopDialog>
	);
}

function renderBlockLookupCell(columnKey: BlockLookupColumnKey, record: BlockLookupRecord) {
	switch (columnKey) {
		case 'spawnCommand':
			return <span className="BlockLookupCommand">{record.spawnCommand}</span>;
		case 'blockName':
			return record.blockName;
		case 'internalName':
			return record.internalName || <span className="BlockLookupMutedText">Not declared</span>;
		case 'modTitle':
			return record.modTitle;
		default:
			return '';
	}
}

function getBlockLookupEmptyText(stats: BlockLookupIndexStats | null, query: string) {
	if (!stats) {
		return 'Build the block lookup index to show commands.';
	}

	if (query.trim()) {
		return 'No blocks match this search.';
	}

	return 'No indexed blocks found.';
}

function useCoarsePointer() {
	const [coarsePointer, setCoarsePointer] = useState(false);

	useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return;
		}

		const query = window.matchMedia('(pointer: coarse)');
		const updateCoarsePointer = () => {
			setCoarsePointer(query.matches);
		};
		updateCoarsePointer();
		query.addEventListener('change', updateCoarsePointer);
		return () => {
			query.removeEventListener('change', updateCoarsePointer);
		};
	}, []);

	return coarsePointer;
}

function BlockLookupDetailField({
	className = '',
	copyLabel,
	label,
	monospace,
	onCopy,
	value
}: {
	className?: string;
	copyLabel?: string;
	label: string;
	monospace?: boolean;
	onCopy?: (value: string) => void;
	value: string;
}) {
	const displayValue = value.trim();
	const hasValue = displayValue.length > 0;
	const valueClassName = `min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${
		hasValue ? 'text-text' : 'BlockLookupMutedText'
	}${monospace ? ' BlockLookupCommand' : ''}`;

	return (
		<div className={className}>
			<span className="BlockLookupMutedText">{label}</span>
			<span className="flex min-w-0 items-center gap-1.5">
				<span className={valueClassName} title={hasValue ? value : undefined}>
					{hasValue ? value : 'Not declared'}
				</span>
				{copyLabel && hasValue ? (
					<DesktopIconButton
						aria-label={copyLabel}
						className="h-(--app-compact-icon-button-size) w-(--app-compact-icon-button-size) shrink-0"
						onClick={() => {
							onCopy?.(value);
						}}
					>
						<Copy size={14} aria-hidden="true" />
					</DesktopIconButton>
				) : null}
			</span>
		</div>
	);
}

function useBlockLookupViewContent({ appState }: BlockLookupViewProps) {
	const {
		availableModFilters,
		buildingIndex,
		handleAutoDetectWorkshopRoot,
		handleBrowseWorkshopRoot,
		handleBuildIndex,
		handleSaveSettings,
		loadingResults,
		modSources,
		openNotification,
		query,
		refreshResults,
		rows,
		selectAllVisibleRows: selectAllVisibleRowKeys,
		selectBlockLookupRow: requestBlockLookupRowSelection,
		selectSingleBlockLookupRow,
		selectedFilterMods,
		selectedRecord,
		selectedRowKeys,
		selectedRowKeysInCopyOrder,
		setQuery,
		setSelectedFilterMods,
		setWorkshopRoot,
		syncSelectionCopyOrder,
		settings,
		stats,
		workshopRoot
	} = useBlockLookupWorkflow({ appState });
	const { config: appConfig, updateState } = appState;
	const {
		saveBlockLookupColumns,
		setBlockLookupColumnOrder,
		setBlockLookupColumnWidth: persistBlockLookupColumnWidth
	} = useViewConfigCommands({ config: appConfig, openNotification, updateState });
	const blockLookupConfig = appConfig.viewConfigs.blockLookup;
	const columnConfig = useMemo(() => getConfiguredBlockLookupColumns(blockLookupConfig), [blockLookupConfig]);
	const columnConfigRef = useRef(columnConfig);
	const coarsePointer = useCoarsePointer();
	const [localState, dispatchLocalState] = useReducer(reduceBlockLookupViewLocalState, {
		availableTableWidth: 0,
		draftColumnConfig: getConfiguredBlockLookupColumns(blockLookupConfig),
		draftSmallRows: !!blockLookupConfig?.smallRows,
		draggingDraftColumnKey: undefined,
		draggingHeaderColumnKey: undefined,
		savingTableOptions: false,
		tableOptionsOpen: false
	});
	const {
		availableTableWidth,
		draftColumnConfig,
		draftSmallRows,
		draggingDraftColumnKey,
		draggingHeaderColumnKey,
		savingTableOptions,
		tableOptionsOpen
	} = localState;
	const setDraftColumnConfig = useCallback((updater: SetStateAction<BlockLookupColumnConfig[]>) => {
		dispatchLocalState({ type: 'draft-column-config-changed', updater });
	}, []);
	const setDraftSmallRows = useCallback((smallRows: boolean) => {
		dispatchLocalState({ type: 'draft-small-rows-changed', smallRows });
	}, []);
	const setTableOptionsOpen = useCallback((open: boolean) => {
		if (!open) {
			dispatchLocalState({ type: 'table-options-closed' });
		}
	}, []);
	const setDraggingHeaderColumnKey = useCallback((columnKey?: BlockLookupColumnKey) => {
		dispatchLocalState({ type: 'dragging-header-column-changed', columnKey });
	}, []);
	const setDraggingDraftColumnKey = useCallback((columnKey?: BlockLookupColumnKey) => {
		dispatchLocalState({ type: 'dragging-draft-column-changed', columnKey });
	}, []);
	const moveDraftColumn = useCallback(
		(columnKey: BlockLookupColumnKey, direction: -1 | 1) => {
			setDraftColumnConfig((currentColumns) => {
				const currentIndex = currentColumns.findIndex((column) => column.key === columnKey);
				const nextIndex = currentIndex + direction;
				if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentColumns.length) {
					return currentColumns;
				}

				return moveBlockLookupColumnByKey(currentColumns, columnKey, currentColumns[nextIndex].key);
			});
		},
		[setDraftColumnConfig]
	);
	const sortKey = useBlockLookupStore((state) => state.sortKey);
	const setSortKey = useBlockLookupStore((state) => state.setSortKey);
	const sortDirection = useBlockLookupStore((state) => state.sortDirection);
	const setSortDirection = useBlockLookupStore((state) => state.setSortDirection);
	const tablePaneRef = useRef<HTMLDivElement | null>(null);
	const tableScrollRef = useRef<HTMLDivElement | null>(null);
	const sortedRows = useMemo(() => {
		return measurePerf('blockLookup.table.sortRows', () => sortBlockLookupRecords(rows, sortKey, sortDirection), {
			rows: rows.length,
			sortKey,
			sortDirection
		});
	}, [rows, sortDirection, sortKey]);
	const sortedRowKeys = useMemo(() => sortedRows.map((record) => getBlockLookupRecordKey(record)), [sortedRows]);
	const selectedRowKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
	const sortedRowsByKey = useMemo(
		() => new Map(sortedRows.map((record) => [getBlockLookupRecordKey(record), record] as const)),
		[sortedRows]
	);
	const selectedRecordsInCopyOrder = useMemo(() => {
		const records: BlockLookupRecord[] = [];
		for (const rowKey of selectedRowKeysInCopyOrder) {
			const record = sortedRowsByKey.get(rowKey);
			if (record) {
				records.push(record);
			}
		}
		return records;
	}, [selectedRowKeysInCopyOrder, sortedRowsByKey]);

	useEffect(() => {
		syncSelectionCopyOrder(sortedRowKeys);
	}, [sortedRowKeys, syncSelectionCopyOrder]);

	useEffect(() => {
		columnConfigRef.current = columnConfig;
	}, [columnConfig]);

	useEffect(() => {
		const tablePane = tablePaneRef.current;
		if (!tablePane) {
			return;
		}

		const syncWidth = (nextWidth: number) => {
			const roundedWidth = Math.round(nextWidth);
			dispatchLocalState({ type: 'available-table-width-changed', width: roundedWidth });
		};

		syncWidth(tablePane.clientWidth);

		if (typeof ResizeObserver === 'undefined') {
			const handleWindowResize = () => {
				syncWidth(tablePane.clientWidth);
			};
			window.addEventListener('resize', handleWindowResize);
			return () => {
				window.removeEventListener('resize', handleWindowResize);
			};
		}

		const resizeObserver = new ResizeObserver((entries) => {
			syncWidth(entries[0]?.contentRect.width ?? tablePane.clientWidth);
		});
		resizeObserver.observe(tablePane);
		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	const handleCopySelected = useCallback(async () => {
		if (selectedRecordsInCopyOrder.length === 0) {
			openNotification(
				{
					message: 'No block selected',
					description: 'Select one or more block commands before copying.',
					placement: 'topRight',
					duration: 2
				},
				'warn'
			);
			return;
		}

		try {
			const commands = selectedRecordsInCopyOrder.map((record) => record.spawnCommand);
			await copyToClipboard(commands.join('\n'));
			openNotification(
				{
					message: `SpawnBlock command${commands.length === 1 ? '' : 's'} copied`,
					description: commands.length === 1 ? commands[0] : `${commands.length} commands copied.`,
					placement: 'topRight',
					duration: 1.5
				},
				'success'
			);
		} catch (error) {
			openNotification(
				{
					message: 'Could not copy command',
					description: formatErrorMessage(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [openNotification, selectedRecordsInCopyOrder]);

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
					description: formatErrorMessage(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [openNotification, sortedRows]);

	const handleSelectAllVisibleRows = useCallback(() => {
		selectAllVisibleRowKeys(sortedRowKeys);
	}, [selectAllVisibleRowKeys, sortedRowKeys]);

	const handleSelectBlockLookupRow = useCallback(
		(rowKey: string, event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>) => {
			requestBlockLookupRowSelection(rowKey, { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey }, sortedRowKeys);
		},
		[requestBlockLookupRowSelection, sortedRowKeys]
	);

	const handleBlockLookupRowKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTableRowElement>) => {
			if (!event.ctrlKey && !event.metaKey) {
				return;
			}

			const key = event.key.toLowerCase();
			if (key === 'c') {
				event.preventDefault();
				void handleCopySelected();
			} else if (key === 'a') {
				event.preventDefault();
				handleSelectAllVisibleRows();
			}
		},
		[handleCopySelected, handleSelectAllVisibleRows]
	);

	const openTableOptions = useCallback(() => {
		const draft = createBlockLookupTableOptionsDraft(blockLookupConfig);
		dispatchLocalState({ type: 'table-options-opened', draft });
	}, [blockLookupConfig]);

	const saveTableOptions = useCallback(async () => {
		dispatchLocalState({ type: 'saving-table-options-changed', saving: true });
		try {
			const persisted = await saveBlockLookupColumns(draftColumnConfig, draftSmallRows);
			if (persisted) {
				dispatchLocalState({ type: 'table-options-closed' });
			}
		} finally {
			dispatchLocalState({ type: 'saving-table-options-changed', saving: false });
		}
	}, [draftColumnConfig, draftSmallRows, saveBlockLookupColumns]);

	const persistColumnOrder = useCallback(
		async (fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) => {
			await setBlockLookupColumnOrder(columnConfig, fromKey, toKey);
		},
		[columnConfig, setBlockLookupColumnOrder]
	);
	const persistColumnWidth = useCallback(
		async (columnKey: BlockLookupColumnKey, width: number) => {
			return persistBlockLookupColumnWidth(columnConfig, columnKey, width);
		},
		[columnConfig, persistBlockLookupColumnWidth]
	);
	const persistColumnVisibility = useCallback(
		async (columnKey: BlockLookupColumnKey, visible: boolean) => {
			const nextColumns = columnConfigRef.current.map((column) => (column.key === columnKey ? { ...column, visible } : column));
			columnConfigRef.current = nextColumns;
			await saveBlockLookupColumns(nextColumns, !!blockLookupConfig?.smallRows);
		},
		[blockLookupConfig?.smallRows, saveBlockLookupColumns]
	);

	const visibleColumns = useMemo(
		() => getResponsiveBlockLookupColumns(columnConfig, availableTableWidth),
		[availableTableWidth, columnConfig]
	);
	const persistedVisibleColumnCount = useMemo(() => columnConfig.filter((column) => column.visible).length, [columnConfig]);
	const hiddenColumns = useMemo(() => columnConfig.filter((column) => !column.visible), [columnConfig]);
	const emptyStateText = getBlockLookupEmptyText(stats, query);
	const lookupBusyText = buildingIndex ? 'Building block lookup index...' : 'Loading block lookup...';
	const indexStatusText = formatBlockLookupIndexStatus(stats, rows.length, query);

	useEffect(() => {
		visibleColumns.forEach((column) => {
			setBlockLookupColumnWidthVariable(tablePaneRef.current, column.key, resolveBlockLookupColumnWidth(column));
		});
	}, [visibleColumns]);

	const tableScrollX = useMemo(() => {
		return Math.max(getBlockLookupTableScrollWidth(visibleColumns), availableTableWidth);
	}, [availableTableWidth, visibleColumns]);
	const needsHorizontalScroll = tableScrollX > availableTableWidth + 1;
	const estimatedRowHeight = blockLookupConfig?.smallRows && !coarsePointer ? 34 : 44;
	const rowVirtualizer = useVirtualizer({
		count: sortedRows.length,
		getScrollElement: () => tableScrollRef.current,
		estimateSize: () => estimatedRowHeight,
		overscan: 16,
		initialRect: {
			height: 640,
			width: availableTableWidth || 1024
		}
	});
	const virtualRows = rowVirtualizer.getVirtualItems();
	const renderedVirtualRows =
		virtualRows.length > 0
			? virtualRows
			: sortedRows.slice(0, Math.min(sortedRows.length, 50)).map((_, index) => ({
					index,
					start: index * estimatedRowHeight
				}));
	const virtualBodyHeight = Math.max(rowVirtualizer.getTotalSize(), sortedRows.length * estimatedRowHeight);
	const copyDetailValue = useCallback(
		(value: string) => {
			void (async () => {
				try {
					await copyToClipboard(value);
					openNotification(
						{
							message: 'Copied block command',
							placement: 'topRight',
							duration: 1
						},
						'success'
					);
				} catch (error) {
					openNotification(
						{
							message: 'Could not copy command',
							description: formatErrorMessage(error),
							placement: 'topRight',
							duration: 3
						},
						'error'
					);
				}
			})();
		},
		[openNotification]
	);

	return (
		<Profiler id="BlockLookup.View" onRender={logProfilerRender}>
			<div className="BlockLookupViewLayout flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-background">
				<header className="WorkspaceHeader BlockLookupWorkspaceHeader flex h-auto flex-col leading-[1.4]">
					<div className={blockLookupToolbarRowClassName}>
						<div className={`relative flex items-center ${blockLookupSearchControlClassName}`}>
							<Search className="pointer-events-none absolute left-3 text-text-muted" size={16} aria-hidden="true" />
							<DesktopInput
								aria-label="Search block aliases"
								className="w-full min-w-0"
								placeholder="Search block, mod, ID, alias"
								style={{ paddingLeft: 38, paddingRight: query ? 48 : 38 }}
								value={query}
								onChange={(event) => {
									markPerfInteraction('blockLookup.search.change', {
										queryLength: event.target.value.length
									});
									setQuery(event.target.value);
								}}
							/>
							{query ? (
								<DesktopIconButton
									aria-label="Clear block lookup search"
									className="absolute right-1"
									onClick={() => {
										setQuery('');
									}}
								>
									<X size={16} aria-hidden="true" />
								</DesktopIconButton>
							) : null}
						</div>
						<div className={`ml-auto ${blockLookupActionGroupClassName} max-[760px]:ml-0`}>
							<BlockLookupButton
								icon={<RefreshCw size={16} aria-hidden="true" />}
								onClick={() => {
									void refreshResults(query);
								}}
								loading={loadingResults}
							>
								Refresh
							</BlockLookupButton>
							<BlockLookupButton icon={<Copy size={16} aria-hidden="true" />} onClick={handleCopySelected}>
								Copy Selected
							</BlockLookupButton>
							<BlockLookupButton icon={<Copy size={16} aria-hidden="true" />} onClick={handleCopyAll}>
								Copy All
							</BlockLookupButton>
							<BlockLookupButton icon={<Settings2 size={16} aria-hidden="true" />} onClick={openTableOptions}>
								Table Settings
							</BlockLookupButton>
						</div>
					</div>
					<section className={blockLookupIndexSourceClassName} aria-label="Index source">
						<span className="BlockLookupIndexLabel shrink-0 text-caption font-[650] uppercase text-text-muted">Index source</span>
						<DesktopInput
							aria-label="Workshop root"
							className={`${blockLookupPathControlClassName} px-3`}
							value={workshopRoot}
							onChange={(event) => {
								setWorkshopRoot(event.target.value);
							}}
							placeholder="TerraTech workshop content folder"
						/>
						<div className={blockLookupIndexActionGroupClassName}>
							<BlockLookupButton
								aria-label="Browse for workshop root"
								icon={<Folder size={16} aria-hidden="true" />}
								onClick={handleBrowseWorkshopRoot}
							>
								Browse
							</BlockLookupButton>
							<BlockLookupButton onClick={handleAutoDetectWorkshopRoot}>Auto Detect</BlockLookupButton>
							<BlockLookupButton disabled={settings.workshopRoot === workshopRoot} onClick={handleSaveSettings}>
								Save Path
							</BlockLookupButton>
							<BlockLookupButton
								icon={<Database size={16} aria-hidden="true" />}
								onClick={() => {
									void handleBuildIndex(false);
								}}
								loading={buildingIndex}
							>
								Update Index
							</BlockLookupButton>
							<BlockLookupButton
								icon={<Database size={16} aria-hidden="true" />}
								onClick={() => {
									void handleBuildIndex(true);
								}}
								disabled={buildingIndex}
							>
								Full Rebuild
							</BlockLookupButton>
						</div>
					</section>
				</header>
				<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<div ref={tablePaneRef} className="BlockLookupTablePane">
						<div
							className={`BlockLookupVirtualShell${loadingResults || buildingIndex ? ' is-loading' : ''}`}
							aria-busy={loadingResults || buildingIndex}
						>
							<div ref={tableScrollRef} className={`BlockLookupVirtualScroll${needsHorizontalScroll ? ' has-horizontal-scroll' : ''}`}>
								<table className="BlockLookupTable BlockLookupVirtualTable" style={{ width: tableScrollX }}>
									<colgroup>
										{visibleColumns.map((column) => (
											<col
												key={column.key}
												style={{ width: getBlockLookupColumnWidthStyle(column.key, resolveBlockLookupColumnWidth(column)) }}
											/>
										))}
										<col />
									</colgroup>
									<thead className="BlockLookupVirtualTableHeader">
										<tr>
											{visibleColumns.map((blockColumn) => {
												const blockColumnKey = blockColumn.key;
												const resolvedWidth = resolveBlockLookupColumnWidth(blockColumn);
												const widthStyle = getBlockLookupColumnWidthStyle(blockColumnKey, resolvedWidth);
												const sorted = sortKey === blockColumnKey;
												const canHideColumn = persistedVisibleColumnCount > 1;
												const modHeaderFilter =
													blockColumnKey === 'modTitle' ? (
														<BlockLookupModHeaderFilter
															availableMods={availableModFilters}
															selectedMods={selectedFilterMods}
															onSelectedModsChange={setSelectedFilterMods}
														/>
													) : null;
												const contextMenuItems = [
													{
														key: `hide:${blockColumnKey}`,
														label: `Hide ${blockColumn.title}`,
														disabled: !canHideColumn
													},
													...(hiddenColumns.length > 0
														? [
																{ type: 'divider' as const },
																...hiddenColumns.map((hiddenColumn) => ({
																	key: `show:${hiddenColumn.key}`,
																	label: `Show ${hiddenColumn.title}`
																}))
															]
														: []),
													{ type: 'divider' as const },
													{
														key: 'view-options',
														label: 'View Options'
													}
												];
												const restorePersistedColumnWidth = () => {
													setBlockLookupColumnWidthVariable(
														tablePaneRef.current,
														blockColumnKey,
														resolveBlockLookupColumnWidth(blockColumn)
													);
												};
												return (
													<BlockLookupHeaderCell
														key={blockColumnKey}
														className={`BlockLookupTableHeaderCell BlockLookupVirtualHeaderCell is-sortable${
															sorted ? ' is-sorted' : ''
														}${draggingHeaderColumnKey === blockColumnKey ? ' is-dragging' : ''}`}
														label={blockColumn.title}
														width={widthStyle}
														resizeWidth={resolvedWidth}
														minWidth={getBlockLookupColumnMinWidth(blockColumn)}
														headerMenu={{
															items: contextMenuItems,
															onClick: (info: { key: Key }) => {
																const key = info.key.toString();
																if (key === 'view-options') {
																	openTableOptions();
																	return;
																}

																if (key.startsWith('hide:')) {
																	const targetKey = key.slice('hide:'.length);
																	if (isBlockLookupColumnKey(targetKey) && persistedVisibleColumnCount > 1) {
																		void persistColumnVisibility(targetKey, false);
																	}
																	return;
																}

																if (key.startsWith('show:')) {
																	const targetKey = key.slice('show:'.length);
																	if (isBlockLookupColumnKey(targetKey)) {
																		void persistColumnVisibility(targetKey, true);
																	}
																}
															}
														}}
														draggable
														data-column-key={blockColumnKey}
														aria-sort={sorted ? (sortDirection === 'ascend' ? 'ascending' : 'descending') : 'none'}
														onDragStart={(event) => {
															event.dataTransfer.effectAllowed = 'move';
															event.dataTransfer.setData('text/plain', blockColumnKey);
															setDraggingHeaderColumnKey(blockColumnKey);
														}}
														onDragOver={(event) => {
															if (draggingHeaderColumnKey && draggingHeaderColumnKey !== blockColumnKey) {
																event.preventDefault();
																event.dataTransfer.dropEffect = 'move';
															}
														}}
														onDrop={(event) => {
															event.preventDefault();
															const sourceKey = event.dataTransfer.getData('text/plain') as BlockLookupColumnKey;
															setDraggingHeaderColumnKey(undefined);
															if (isBlockLookupColumnKey(sourceKey)) {
																void persistColumnOrder(sourceKey, blockColumnKey);
															}
														}}
														onDragEnd={() => {
															setDraggingHeaderColumnKey(undefined);
														}}
														onResize={(nextWidth: number) => {
															setBlockLookupColumnWidthVariable(tablePaneRef.current, blockColumnKey, nextWidth);
														}}
														onResizeEnd={(nextWidth: number) => {
															setBlockLookupColumnWidthVariable(tablePaneRef.current, blockColumnKey, nextWidth);
															void (async () => {
																const persisted = await persistColumnWidth(blockColumnKey, nextWidth);
																if (!persisted) {
																	restorePersistedColumnWidth();
																}
															})();
														}}
													>
														<div
															className={`BlockLookupColumnHeaderContent${modHeaderFilter ? ' BlockLookupColumnHeaderContent--withFilter' : ''}`}
														>
															<button
																type="button"
																className="BlockLookupVirtualHeaderButton"
																draggable={false}
																onClick={() => {
																	markPerfInteraction('blockLookup.sort', {
																		column: blockColumnKey,
																		rows: sortedRows.length
																	});
																	setSortDirection((currentDirection) =>
																		getNextBlockLookupSortDirection(sortKey, currentDirection, blockColumnKey)
																	);
																	setSortKey(blockColumnKey);
																}}
															>
																<span className="BlockLookupTableHeaderLabel">{blockColumn.title}</span>
																<span className="BlockLookupVirtualSortIndicator" aria-hidden="true">
																	{sorted ? (sortDirection === 'ascend' ? '▲' : '▼') : null}
																</span>
															</button>
															{modHeaderFilter}
														</div>
													</BlockLookupHeaderCell>
												);
											})}
											<th className="BlockLookupVirtualFillerCell" aria-hidden="true" />
										</tr>
									</thead>
									<VirtualTableBody className="BlockLookupVirtualTableBody" height={virtualBodyHeight} width={tableScrollX}>
										{renderedVirtualRows.map((virtualRow) => {
											const record = sortedRows[virtualRow.index];
											if (!record) {
												return null;
											}
											const rowKey = getBlockLookupRecordKey(record);
											const rowSelected = selectedRowKeySet.has(rowKey);

											return (
												<VirtualTableRow
													key={rowKey}
													dataIndex={virtualRow.index}
													className={`BlockLookupVirtualRow${blockLookupConfig?.smallRows ? ' CompactBlockLookupRow' : ''}${
														rowSelected ? ' is-selected' : ''
													}`}
													rowHeight={estimatedRowHeight}
													start={virtualRow.start}
													width={tableScrollX}
													aria-label={`Block lookup row for ${record.spawnCommand}. Press Enter or Space to select the row.`}
													aria-selected={rowSelected}
													keyboardShortcuts="Enter Space Control+C Control+A"
													onKeyDown={handleBlockLookupRowKeyDown}
													onActivate={(event) => {
														markPerfInteraction('blockLookup.rowSelect', {
															row: rowKey
														});
														handleSelectBlockLookupRow(rowKey, event);
													}}
													onDoubleClick={() => {
														markPerfInteraction('blockLookup.rowDoubleClickCopy', {
															row: rowKey
														});
														selectSingleBlockLookupRow(rowKey);
														void copyToClipboard(record.spawnCommand).catch((error) => {
															openNotification(
																{
																	message: 'Could not copy command',
																	description: formatErrorMessage(error),
																	placement: 'topRight',
																	duration: 3
																},
																'error'
															);
														});
													}}
												>
													{visibleColumns.map((column) => {
														const alignment = getBlockLookupCellAlignment(column.key);
														return (
															<td
																key={`${rowKey}:${column.key}`}
																className={`BlockLookupVirtualCell BlockLookupVirtualCell--align-${alignment}`}
																data-column-title={column.key}
																style={{
																	...getBlockLookupVirtualColumnStyle(
																		getBlockLookupColumnWidthStyle(column.key, resolveBlockLookupColumnWidth(column))
																	),
																	textAlign: alignment
																}}
															>
																{renderBlockLookupCell(column.key, record)}
															</td>
														);
													})}
													<td className="BlockLookupVirtualCell BlockLookupVirtualFillerCell" aria-hidden="true" />
												</VirtualTableRow>
											);
										})}
									</VirtualTableBody>
								</table>
								{!loadingResults && !buildingIndex && sortedRows.length === 0 ? (
									<div className="BlockLookupVirtualEmpty">
										<span className="BlockLookupMutedText">{emptyStateText}</span>
									</div>
								) : null}
							</div>
							{loadingResults || buildingIndex ? <div className="BlockLookupVirtualLoading">{lookupBusyText}</div> : null}
						</div>
					</div>
					<div className="BlockLookupDetailsPane">
						<div className="BlockLookupDetailsMeta" aria-live="polite">
							<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{indexStatusText}</span>
							<span aria-hidden="true">/</span>
							<span>
								{modSources.length} loaded mod source{modSources.length === 1 ? '' : 's'} available
							</span>
						</div>
						{selectedRecord ? (
							<div className="BlockLookupDetailsGrid">
								<BlockLookupDetailField
									label="Command"
									value={selectedRecord.spawnCommand}
									monospace
									copyLabel="Copy command"
									onCopy={copyDetailValue}
								/>
								<BlockLookupDetailField
									label="Fallback"
									value={selectedRecord.fallbackSpawnCommand}
									monospace
									copyLabel="Copy fallback command"
									onCopy={copyDetailValue}
								/>
								<BlockLookupDetailField label="Block" value={selectedRecord.blockName} />
								<BlockLookupDetailField label="Internal" value={selectedRecord.internalName} />
								<BlockLookupDetailField label="Mod" value={selectedRecord.modTitle} />
								<BlockLookupDetailField label="Workshop ID" value={selectedRecord.workshopId} />
								<BlockLookupDetailField className="col-span-full" label="Source" value={selectedRecord.sourcePath} />
							</div>
						) : (
							<span className="BlockLookupMutedText">No block selected</span>
						)}
					</div>
				</main>
				{tableOptionsOpen ? (
					<BlockLookupTableOptionsModal
						onCancel={() => {
							setTableOptionsOpen(false);
						}}
						footer={
							<>
								<BlockLookupButton
									disabled={savingTableOptions}
									onClick={() => {
										setTableOptionsOpen(false);
									}}
								>
									Cancel
								</BlockLookupButton>
								<BlockLookupButton
									loading={savingTableOptions}
									disabled={savingTableOptions}
									variant="primary"
									onClick={() => {
										void saveTableOptions();
									}}
								>
									Save Table Settings
								</BlockLookupButton>
							</>
						}
					>
						<form className="grid w-full max-w-full gap-3">
							<div className="grid w-full grid-cols-[1fr_auto] items-center gap-4 max-[620px]:grid-cols-1 max-[620px]:items-start">
								<div className="flex min-w-0 items-center">
									<h3 className="m-0 text-body font-bold leading-[var(--app-leading-ui)] text-text">Table layout</h3>
								</div>
								<div className="inline-flex min-w-0 items-center gap-2.5">
									<div className="min-w-0">
										<strong>Compact rows</strong>
									</div>
									<BlockLookupSwitch
										aria-label="Use extra-compact rows in the block lookup table"
										checked={draftSmallRows}
										onChange={(checked) => {
											setDraftSmallRows(checked);
										}}
									/>
								</div>
							</div>
							<div className="grid w-full grid-cols-[repeat(2,minmax(360px,1fr))] gap-x-5 pb-0.5 max-[900px]:hidden" aria-hidden>
								{[0, 1].map((columnGroupIndex) => (
									<div
										className="grid grid-cols-[minmax(0,1fr)_auto_auto_minmax(120px,144px)] items-center gap-2 [&>span]:text-caption [&>span]:font-[650] [&>span]:uppercase [&>span]:text-text-muted"
										key={columnGroupIndex}
									>
										<span>Column</span>
										<span>Move</span>
										<span>Show</span>
										<span>Saved width</span>
									</div>
								))}
							</div>
							<div className="grid w-full grid-cols-[repeat(2,minmax(360px,1fr))] gap-x-5 gap-y-2 max-[900px]:grid-cols-1">
								{getBlockLookupDraftColumnStates(draftColumnConfig).map(({ cannotHide, column }, index, draftColumns) => {
									return (
										// biome-ignore lint/a11y/noNoninteractiveElementInteractions: this settings row is a drag-and-drop target controlled by pointer drag events.
										// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop row semantics are provided by the contained controls.
										<div
											className={`BlockLookupSettingsColumnRow grid grid-cols-[minmax(0,1fr)_auto_auto_minmax(120px,144px)] items-center gap-2 py-1 max-[620px]:grid-cols-[minmax(0,1fr)_auto_auto] max-[620px]:gap-y-1${draggingDraftColumnKey === column.key ? ' is-dragging' : ''}`}
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
													setDraftColumnConfig((currentColumns) => moveBlockLookupColumnByKey(currentColumns, sourceKey, column.key));
												}
											}}
											onDragEnd={() => {
												setDraggingDraftColumnKey(undefined);
											}}
										>
											<div className="flex min-w-0 flex-col gap-0.5">
												<strong>{column.title}</strong>
											</div>
											<div className="inline-flex items-center gap-0.5">
												<DesktopIconButton
													aria-label={`Move ${column.title} column left`}
													className={blockLookupColumnMoveButtonClassName}
													disabled={index === 0}
													onClick={() => {
														moveDraftColumn(column.key, -1);
													}}
												>
													<ChevronLeft size={14} aria-hidden="true" />
												</DesktopIconButton>
												<DesktopIconButton
													aria-label={`Move ${column.title} column right`}
													className={blockLookupColumnMoveButtonClassName}
													disabled={index === draftColumns.length - 1}
													onClick={() => {
														moveDraftColumn(column.key, 1);
													}}
												>
													<ChevronRight size={14} aria-hidden="true" />
												</DesktopIconButton>
											</div>
											<div className="flex min-h-11 w-13 items-center justify-start">
												<BlockLookupSwitch
													aria-label={`Show ${column.title} column`}
													checked={column.visible}
													disabled={cannotHide}
													onChange={(checked) => {
														setDraftColumnConfig((currentColumns) =>
															setBlockLookupDraftColumnVisibility(currentColumns, column.key, checked)
														);
													}}
												/>
											</div>
											<div className="w-full max-[620px]:col-span-3">
												<BlockLookupNumberInput
													aria-label={`Saved width for ${column.title} column`}
													min={column.minWidth}
													max={720}
													step={10}
													value={column.width}
													placeholder={`Auto (${column.minWidth}px min)`}
													disabled={!column.visible}
													onChange={(value) => {
														setDraftColumnConfig((currentColumns) => setBlockLookupDraftColumnWidth(currentColumns, column.key, value));
													}}
												/>
											</div>
										</div>
									);
								})}
							</div>
						</form>
					</BlockLookupTableOptionsModal>
				) : null}
			</div>
		</Profiler>
	);
}

function BlockLookupViewComponent(props: BlockLookupViewProps) {
	return useBlockLookupViewContent(props);
}

export const BlockLookupView = memo(BlockLookupViewComponent);

export default function BlockLookupRoute() {
	return <BlockLookupView appState={useOutletContext<AppState>()} />;
}

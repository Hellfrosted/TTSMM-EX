import { Profiler, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useOutletContext } from 'react-router-dom';
import { Copy, Database, Folder, RefreshCw, Search, Settings2, X } from 'lucide-react';
import type { AppState } from 'model';
import type { BlockLookupRecord } from 'shared/block-lookup';
import api from 'renderer/Api';
import { formatBlockLookupIndexStatus, getBlockLookupRecordKey } from 'renderer/block-lookup-workspace';
import {
	desktopControlBaseClassName,
	desktopControlFocusClassName,
	desktopDisabledClassName,
	desktopSwitchClassName,
	joinClassNames
} from 'renderer/components/desktop-control-classes';
import { DesktopButton as BlockLookupButton, DesktopDialog, DesktopInput, DesktopSwitch } from 'renderer/components/DesktopControls';
import { logProfilerRender, markPerfInteraction, measurePerf } from 'renderer/perf';
import { useBlockLookupStore, type BlockLookupColumnKey } from 'renderer/state/block-lookup-store';
import {
	getConfiguredBlockLookupColumns,
	moveBlockLookupColumn,
	moveBlockLookupColumnByKey,
	persistViewConfig,
	setBlockLookupColumnWidth,
	setBlockLookupColumns,
	type BlockLookupColumnConfig
} from 'renderer/view-config-persistence';
import {
	BlockLookupHeaderCell,
	getBlockLookupColumnWidthStyle,
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
	return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
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

const blockLookupControlClassName = [desktopControlBaseClassName, desktopDisabledClassName, desktopControlFocusClassName].join(' ');

function BlockLookupSwitch({ checked, disabled, onChange, ...props }: BlockLookupSwitchProps) {
	return (
		<DesktopSwitch
			{...props}
			className={joinClassNames(desktopSwitchClassName, 'm-0')}
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
			className={[blockLookupControlClassName, 'w-full px-[11px] outline-none'].join(' ')}
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

function BlockLookupTableOptionsModal({ children, footer, onCancel }: BlockLookupTableOptionsModalProps) {
	return (
		<DesktopDialog
			open
			title="Block lookup table options"
			titleClassName="text-[1.05rem] font-bold"
			closeLabel="Close modal"
			onCancel={onCancel}
			overlayClassName="px-3 pb-3 pt-[68px]"
			panelClassName="max-h-[calc(100vh-48px)] w-[min(760px,100%)] max-w-[calc(100vw-32px)]"
			bodyClassName="pb-3 pt-2.5"
			footer={footer}
		>
			{children}
		</DesktopDialog>
	);
}

function renderBlockLookupCell(columnKey: BlockLookupColumnKey, record: BlockLookupRecord) {
	switch (columnKey) {
		case 'spawnCommand':
			return <span className="BlockLookupCommand">{record.spawnCommand}</span>;
		case 'blockName':
			return record.blockName;
		case 'modTitle':
			return record.modTitle;
		case 'blockId':
			return record.blockId || <span className="BlockLookupMutedText">Not declared</span>;
		case 'sourceKind':
			return <span className="BlockLookupTag">{record.sourceKind}</span>;
		default:
			return '';
	}
}

function BlockLookupViewComponent({ appState }: BlockLookupViewProps) {
	const {
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
		selectedRecord,
		selectedRowKey,
		setQuery,
		setSelectedRowKey,
		setWorkshopRoot,
		settings,
		stats,
		workshopRoot
	} = useBlockLookupWorkflow({ appState });
	const { config: appConfig, updateState } = appState;
	const blockLookupConfig = appConfig.viewConfigs.blockLookup;
	const columnConfig = useMemo(() => getConfiguredBlockLookupColumns(blockLookupConfig), [blockLookupConfig]);
	const [draftColumnConfig, setDraftColumnConfig] = useState<BlockLookupColumnConfig[]>(() =>
		getConfiguredBlockLookupColumns(blockLookupConfig)
	);
	const [draftSmallRows, setDraftSmallRows] = useState(!!blockLookupConfig?.smallRows);
	const [savingTableOptions, setSavingTableOptions] = useState(false);
	const sortKey = useBlockLookupStore((state) => state.sortKey);
	const setSortKey = useBlockLookupStore((state) => state.setSortKey);
	const sortDirection = useBlockLookupStore((state) => state.sortDirection);
	const setSortDirection = useBlockLookupStore((state) => state.setSortDirection);
	const [tableOptionsOpen, setTableOptionsOpen] = useState(false);
	const [availableTableWidth, setAvailableTableWidth] = useState(0);
	const [draggingHeaderColumnKey, setDraggingHeaderColumnKey] = useState<BlockLookupColumnKey>();
	const [draggingDraftColumnKey, setDraggingDraftColumnKey] = useState<BlockLookupColumnKey>();
	const tablePaneRef = useRef<HTMLDivElement | null>(null);
	const tableScrollRef = useRef<HTMLDivElement | null>(null);
	const sortedRows = useMemo(() => {
		return measurePerf(
			'blockLookup.table.sortRows',
			() => {
				if (sortKey === 'relevance') {
					return rows;
				}
				const directionMultiplier = sortDirection === 'ascend' ? 1 : -1;
				return [...rows].sort((leftRecord, rightRecord) => {
					const compared = compareSortValues(getSortValue(leftRecord, sortKey), getSortValue(rightRecord, sortKey));
					if (compared !== 0) {
						return compared * directionMultiplier;
					}
					return getBlockLookupRecordKey(leftRecord).localeCompare(getBlockLookupRecordKey(rightRecord));
				});
			},
			{
				rows: rows.length,
				sortKey,
				sortDirection
			}
		);
	}, [rows, sortDirection, sortKey]);

	useEffect(() => {
		const tablePane = tablePaneRef.current;
		if (!tablePane) {
			return;
		}

		const syncWidth = (nextWidth: number) => {
			const roundedWidth = Math.round(nextWidth);
			setAvailableTableWidth((currentWidth) => (currentWidth === roundedWidth ? currentWidth : roundedWidth));
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
		setDraftColumnConfig(getConfiguredBlockLookupColumns(blockLookupConfig));
		setDraftSmallRows(!!blockLookupConfig?.smallRows);
		setTableOptionsOpen(true);
	}, [blockLookupConfig]);

	const saveTableOptions = useCallback(async () => {
		setSavingTableOptions(true);
		try {
			await persistViewConfig(setBlockLookupColumns(appConfig, draftColumnConfig, draftSmallRows), (config) => updateState({ config }));
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
	}, [appConfig, draftColumnConfig, draftSmallRows, openNotification, updateState]);

	const persistColumnOrder = useCallback(
		async (fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) => {
			if (fromKey === toKey) {
				return;
			}

			try {
				await persistViewConfig(moveBlockLookupColumn(appConfig, columnConfig, fromKey, toKey), (config) => updateState({ config }));
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
		[appConfig, columnConfig, openNotification, updateState]
	);
	const persistColumnWidth = useCallback(
		async (columnKey: BlockLookupColumnKey, width: number) => {
			try {
				return await persistViewConfig(setBlockLookupColumnWidth(appConfig, columnConfig, columnKey, width), (config) =>
					updateState({ config })
				);
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
		[appConfig, columnConfig, openNotification, updateState]
	);

	useEffect(() => {
		columnConfig.forEach((column) => {
			setBlockLookupColumnWidthVariable(tablePaneRef.current, column.key, resolveBlockLookupColumnWidth(column));
		});
	}, [columnConfig]);

	const visibleColumns = useMemo(
		() => getResponsiveBlockLookupColumns(columnConfig, availableTableWidth),
		[availableTableWidth, columnConfig]
	);
	const tableScrollX = useMemo(() => {
		const visibleColumnWidth = visibleColumns.reduce((totalWidth, column) => totalWidth + resolveBlockLookupColumnWidth(column), 0);
		return Math.max(visibleColumnWidth, availableTableWidth);
	}, [availableTableWidth, visibleColumns]);
	const tableColumnDefs = useMemo<ColumnDef<BlockLookupRecord>[]>(
		() =>
			visibleColumns.map<ColumnDef<BlockLookupRecord>>((column) => ({
				id: column.key,
				size: resolveBlockLookupColumnWidth(column),
				accessorFn: (record) => getSortValue(record, column.key),
				header: column.title,
				cell: ({ row }) => renderBlockLookupCell(column.key, row.original)
			})),
		[visibleColumns]
	);
	const table = useReactTable({
		data: sortedRows,
		columns: tableColumnDefs,
		getCoreRowModel: getCoreRowModel(),
		getRowId: getBlockLookupRecordKey
	});
	const tableRows = table.getRowModel().rows;
	const rowVirtualizer = useVirtualizer({
		count: tableRows.length,
		getScrollElement: () => tableScrollRef.current,
		estimateSize: () => (blockLookupConfig?.smallRows ? 36 : 44),
		overscan: 16,
		initialRect: {
			height: 640,
			width: availableTableWidth || 1024
		},
		measureElement: (element) => element.getBoundingClientRect().height
	});
	const estimatedRowHeight = blockLookupConfig?.smallRows ? 36 : 44;
	const virtualRows = rowVirtualizer.getVirtualItems();
	const renderedVirtualRows =
		virtualRows.length > 0
			? virtualRows
			: tableRows.slice(0, Math.min(tableRows.length, 50)).map((_, index) => ({
					index,
					start: index * estimatedRowHeight
				}));
	const virtualBodyHeight = Math.max(rowVirtualizer.getTotalSize(), tableRows.length * estimatedRowHeight);
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
							description: String(error),
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
				<header className="flex h-auto min-h-[138px] flex-col gap-2.5 border-b border-border bg-surface px-5 pb-3 pt-3.5 leading-[1.4] max-[760px]:px-3.5">
					<div className="flex min-w-0 flex-wrap items-center gap-2.5">
						<div className="relative flex min-w-[280px] max-w-[560px] flex-[1_1_340px] items-center max-[760px]:min-w-0 max-[760px]:max-w-none max-[760px]:basis-full">
							<Search className="pointer-events-none absolute left-3 text-text-muted" size={16} aria-hidden="true" />
							<input
								aria-label="Search block aliases"
								className={[blockLookupControlClassName, 'w-full min-w-0 px-[38px]'].join(' ')}
								placeholder="Search block, mod, ID, alias"
								value={query}
								onChange={(event) => {
									markPerfInteraction('blockLookup.search.change', {
										queryLength: event.target.value.length
									});
									setQuery(event.target.value);
								}}
							/>
							{query ? (
								<button
									aria-label="Clear block lookup search"
									className={[
										'absolute right-1 inline-flex h-[calc(var(--app-control-height)-8px)] min-h-0 w-[calc(var(--app-control-height)-8px)] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-muted',
										'enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]',
										desktopControlFocusClassName
									].join(' ')}
									type="button"
									onClick={() => {
										setQuery('');
									}}
								>
									<X size={16} aria-hidden="true" />
								</button>
							) : null}
						</div>
						<div className="ml-auto inline-flex flex-wrap items-center gap-2.5 max-[760px]:ml-0 max-[760px]:w-full max-[760px]:[&>button]:flex-1">
							<BlockLookupButton
								icon={<RefreshCw size={16} aria-hidden="true" />}
								onClick={() => {
									void refreshResults(query);
								}}
								loading={loadingResults}
							>
								Refresh
							</BlockLookupButton>
							<BlockLookupButton
								variant="primary"
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
							<BlockLookupButton icon={<Copy size={16} aria-hidden="true" />} onClick={handleCopySelected}>
								Copy Selected
							</BlockLookupButton>
							<BlockLookupButton icon={<Copy size={16} aria-hidden="true" />} onClick={handleCopyAll}>
								Copy All
							</BlockLookupButton>
							<BlockLookupButton icon={<Settings2 size={16} aria-hidden="true" />} onClick={openTableOptions}>
								Table Options
							</BlockLookupButton>
						</div>
					</div>
					<div className="flex min-w-0 items-center gap-2.5 max-[760px]:flex-wrap">
						<input
							aria-label="Workshop root"
							className={[
								blockLookupControlClassName,
								'min-w-[260px] flex-[1_1_auto] px-3 max-[760px]:min-w-0 max-[760px]:basis-full'
							].join(' ')}
							value={workshopRoot}
							onChange={(event) => {
								setWorkshopRoot(event.target.value);
							}}
							placeholder="TerraTech workshop content folder"
						/>
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
					</div>
					<div
						className="flex min-w-0 items-center justify-between gap-2.5 text-text-muted max-[760px]:flex-col max-[760px]:items-start"
						aria-live="polite"
					>
						<span>{formatBlockLookupIndexStatus(stats, rows.length, query)}</span>
						<span className="BlockLookupMutedText">
							{modSources.length} loaded mod source{modSources.length === 1 ? '' : 's'} available
						</span>
					</div>
				</header>
				<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<div ref={tablePaneRef} className="BlockLookupTablePane">
						<div className={`BlockLookupVirtualShell${loadingResults || buildingIndex ? ' is-loading' : ''}`}>
							<div ref={tableScrollRef} className="BlockLookupVirtualScroll">
								<table className="BlockLookupTable BlockLookupVirtualTable" style={{ width: tableScrollX, minWidth: '100%' }}>
									<thead className="BlockLookupVirtualTableHeader">
										{table.getHeaderGroups().map((headerGroup) => (
											<tr key={headerGroup.id}>
												{headerGroup.headers.map((header) => {
													const columnKey = header.column.id;
													const blockColumnKey = isBlockLookupColumnKey(columnKey) ? columnKey : undefined;
													const blockColumn = blockColumnKey ? visibleColumns.find((column) => column.key === blockColumnKey) : undefined;
													const resolvedWidth = blockColumn ? resolveBlockLookupColumnWidth(blockColumn) : header.getSize();
													const widthStyle = blockColumnKey
														? getBlockLookupColumnWidthStyle(blockColumnKey, resolvedWidth)
														: header.getSize();
													const sorted = blockColumnKey && sortKey === blockColumnKey;
													const draggable = !!blockColumnKey;
													const restorePersistedColumnWidth = () => {
														if (!blockColumnKey || !blockColumn) {
															return;
														}
														setBlockLookupColumnWidthVariable(
															tablePaneRef.current,
															blockColumnKey,
															resolveBlockLookupColumnWidth(blockColumn)
														);
													};
													return (
														<BlockLookupHeaderCell
															key={header.id}
															className={`BlockLookupTableHeaderCell BlockLookupVirtualHeaderCell${
																draggable ? ' is-sortable' : ''
															}${sorted ? ' is-sorted' : ''}${draggingHeaderColumnKey === blockColumnKey ? ' is-dragging' : ''}`}
															label={blockColumn ? blockColumn.title : undefined}
															width={widthStyle}
															resizeWidth={resolvedWidth}
															minWidth={blockColumn?.minWidth}
															draggable={draggable}
															data-column-key={blockColumnKey}
															aria-sort={sorted ? (sortDirection === 'ascend' ? 'ascending' : 'descending') : 'none'}
															onDragStart={(event) => {
																if (!blockColumnKey) {
																	return;
																}
																event.dataTransfer.effectAllowed = 'move';
																event.dataTransfer.setData('text/plain', blockColumnKey);
																setDraggingHeaderColumnKey(blockColumnKey);
															}}
															onDragOver={(event) => {
																if (blockColumnKey && draggingHeaderColumnKey && draggingHeaderColumnKey !== blockColumnKey) {
																	event.preventDefault();
																	event.dataTransfer.dropEffect = 'move';
																}
															}}
															onDrop={(event) => {
																if (!blockColumnKey) {
																	return;
																}
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
																if (!blockColumnKey) {
																	return;
																}
																setBlockLookupColumnWidthVariable(tablePaneRef.current, blockColumnKey, nextWidth);
															}}
															onResizeEnd={(nextWidth: number) => {
																if (!blockColumnKey) {
																	return;
																}
																setBlockLookupColumnWidthVariable(tablePaneRef.current, blockColumnKey, nextWidth);
																void (async () => {
																	const persisted = await persistColumnWidth(blockColumnKey, nextWidth);
																	if (!persisted) {
																		restorePersistedColumnWidth();
																	}
																})();
															}}
														>
															{blockColumnKey ? (
																<button
																	type="button"
																	className="BlockLookupVirtualHeaderButton"
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
																	<span className="BlockLookupTableHeaderLabel">
																		{flexRender(header.column.columnDef.header, header.getContext())}
																	</span>
																	<span className="BlockLookupVirtualSortIndicator" aria-hidden="true">
																		{sorted ? (sortDirection === 'ascend' ? '▲' : '▼') : '↕'}
																	</span>
																</button>
															) : null}
														</BlockLookupHeaderCell>
													);
												})}
											</tr>
										))}
									</thead>
									<tbody className="BlockLookupVirtualTableBody" style={{ height: virtualBodyHeight }}>
										{renderedVirtualRows.map((virtualRow) => {
											const row = tableRows[virtualRow.index];
											if (!row) {
												return null;
											}

											return (
												<tr
													key={row.id}
													ref={rowVirtualizer.measureElement}
													data-index={virtualRow.index}
													className={`BlockLookupVirtualRow${blockLookupConfig?.smallRows ? ' CompactBlockLookupRow' : ''}${
														selectedRowKey === row.id ? ' is-selected' : ''
													}`}
													style={{ transform: `translateY(${virtualRow.start}px)` }}
													onClick={() => {
														markPerfInteraction('blockLookup.rowSelect', {
															row: row.id
														});
														setSelectedRowKey(row.id);
													}}
													onDoubleClick={() => {
														markPerfInteraction('blockLookup.rowDoubleClickCopy', {
															row: row.id
														});
														setSelectedRowKey(row.id);
														void copyToClipboard(row.original.spawnCommand).catch((error) => {
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
													}}
												>
													{row.getVisibleCells().map((cell) => (
														<td
															key={cell.id}
															className="BlockLookupVirtualCell"
															data-column-title={cell.column.id}
															style={{
																width: isBlockLookupColumnKey(cell.column.id)
																	? getBlockLookupColumnWidthStyle(cell.column.id, cell.column.getSize())
																	: cell.column.getSize()
															}}
														>
															{flexRender(cell.column.columnDef.cell, cell.getContext())}
														</td>
													))}
												</tr>
											);
										})}
									</tbody>
								</table>
								{!loadingResults && !buildingIndex && tableRows.length === 0 ? (
									<div className="BlockLookupVirtualEmpty">
										<span className="BlockLookupMutedText">No block lookup results</span>
									</div>
								) : null}
							</div>
							{loadingResults || buildingIndex ? <div className="BlockLookupVirtualLoading">Loading block lookup...</div> : null}
						</div>
					</div>
					<div className="max-h-[184px] min-h-28 flex-none overflow-auto border-t border-border bg-surface px-4 pb-3.5 pt-3">
						{selectedRecord ? (
							<div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(220px,1.4fr)_repeat(4,minmax(120px,0.8fr))] items-start gap-x-4 gap-y-2.5 max-[900px]:grid-cols-[repeat(2,minmax(180px,1fr))] max-[520px]:grid-cols-1 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-[3px]">
								<div>
									<span className="BlockLookupMutedText">Command</span>
									<span className="flex min-w-0 items-center gap-1.5">
										<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">{selectedRecord.spawnCommand}</span>
										<button
											aria-label="Copy command"
											className={[
												'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-muted',
												'hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] hover:text-text',
												desktopControlFocusClassName
											].join(' ')}
											type="button"
											onClick={() => {
												copyDetailValue(selectedRecord.spawnCommand);
											}}
										>
											<Copy size={14} aria-hidden="true" />
										</button>
									</span>
								</div>
								<div>
									<span className="BlockLookupMutedText">Fallback</span>
									<span className="flex min-w-0 items-center gap-1.5">
										<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">
											{selectedRecord.fallbackSpawnCommand}
										</span>
										<button
											aria-label="Copy fallback command"
											className={[
												'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-muted',
												'hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] hover:text-text',
												desktopControlFocusClassName
											].join(' ')}
											type="button"
											onClick={() => {
												copyDetailValue(selectedRecord.fallbackSpawnCommand);
											}}
										>
											<Copy size={14} aria-hidden="true" />
										</button>
									</span>
								</div>
								<div>
									<span className="BlockLookupMutedText">Block</span>
									<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">{selectedRecord.blockName}</span>
								</div>
								<div>
									<span className="BlockLookupMutedText">Internal</span>
									<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">{selectedRecord.internalName}</span>
								</div>
								<div>
									<span className="BlockLookupMutedText">Mod</span>
									<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">{selectedRecord.modTitle}</span>
								</div>
								<div>
									<span className="BlockLookupMutedText">Workshop ID</span>
									<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">{selectedRecord.workshopId}</span>
								</div>
								<div className="col-span-full">
									<span className="BlockLookupMutedText">Source</span>
									<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text">{selectedRecord.sourcePath}</span>
								</div>
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
						<form className="CollectionSettingsForm CollectionSettingsForm--dense">
							<div className="CollectionSettingsTopBar">
								<div className="CollectionSettingsTopCopy">
									<h3 className="CollectionSettingsSubheading">Table layout</h3>
								</div>
								<div className="CollectionSettingsToggleCard">
									<div className="CollectionSettingsToggleCopy">
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
							<div className="CollectionSettingsColumnsHeader BlockLookupSettingsColumnsHeader" aria-hidden>
								<div className="CollectionSettingsColumnsHeaderGroup">
									<span>Column</span>
									<span>Show</span>
									<span>Saved width</span>
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
													setDraftColumnConfig((currentColumns) => moveBlockLookupColumnByKey(currentColumns, sourceKey, column.key));
												}
											}}
											onDragEnd={() => {
												setDraggingDraftColumnKey(undefined);
											}}
										>
											<div className="CollectionSettingsColumnLabel">
												<strong>{column.title}</strong>
											</div>
											<div className="CollectionSettingsColumnSwitch">
												<BlockLookupSwitch
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
												<BlockLookupNumberInput
													aria-label={`Saved width for ${column.title} column`}
													min={column.minWidth}
													max={720}
													step={10}
													value={column.width}
													placeholder={`Auto (${column.minWidth}px min)`}
													disabled={!column.visible}
													onChange={(value) => {
														setDraftColumnConfig((currentColumns) =>
															currentColumns.map((currentColumn) => {
																if (currentColumn.key !== column.key || typeof value !== 'number') {
																	return currentColumn;
																}
																return { ...currentColumn, width: value };
															})
														);
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

export const BlockLookupView = memo(BlockLookupViewComponent);

export default function BlockLookupRoute() {
	return <BlockLookupView appState={useOutletContext<AppState>()} />;
}

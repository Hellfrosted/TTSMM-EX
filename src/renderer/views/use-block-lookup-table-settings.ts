import type { AppState } from 'model';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getConfiguredBlockLookupColumns } from 'renderer/block-lookup-column-config';
import type { BlockLookupColumnConfig } from 'renderer/block-lookup-column-definitions';
import { createBlockLookupTableOptionsDraft, moveBlockLookupColumnByKey } from 'renderer/block-lookup-draft-config';
import {
	type BlockLookupColumnKey,
	type BlockLookupTableWorkspaceEvent,
	createBlockLookupTableWorkspaceState,
	reduceBlockLookupTableWorkspace
} from 'renderer/block-lookup-table-workspace';
import { useViewConfigCommands } from 'renderer/view-config-command';
import type { useBlockLookupWorkflow } from './use-block-lookup-workflow';

function useBlockLookupTableWidth() {
	const tablePaneRef = useRef<HTMLDivElement | null>(null);
	const [availableTableWidth, setAvailableTableWidth] = useState(0);

	useEffect(() => {
		const tablePane = tablePaneRef.current;
		if (!tablePane) {
			return;
		}

		const syncWidth = (nextWidth: number) => {
			const roundedWidth = Math.round(nextWidth);
			setAvailableTableWidth(roundedWidth);
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

	return { availableTableWidth, tablePaneRef };
}

function moveDraftColumnByDirection(columns: BlockLookupColumnConfig[], columnKey: BlockLookupColumnKey, direction: -1 | 1) {
	const currentIndex = columns.findIndex((column) => column.key === columnKey);
	const nextIndex = currentIndex + direction;
	if (currentIndex < 0 || nextIndex < 0 || nextIndex >= columns.length) return columns;
	return moveBlockLookupColumnByKey(columns, columnKey, columns[nextIndex].key);
}

async function saveTableOptionsDraft(
	dispatch: Dispatch<BlockLookupTableWorkspaceEvent>,
	save: (columns: BlockLookupColumnConfig[], smallRows: boolean) => Promise<boolean>,
	columns: BlockLookupColumnConfig[],
	smallRows: boolean
) {
	dispatch({ type: 'saving-table-options-changed', saving: true });
	try {
		if (await save(columns, smallRows)) dispatch({ type: 'table-options-closed' });
	} finally {
		dispatch({ type: 'saving-table-options-changed', saving: false });
	}
}

function useTableSettingsActions(dispatchLocalState: Dispatch<BlockLookupTableWorkspaceEvent>) {
	const setDraftColumnConfig = useCallback(
		(updater: SetStateAction<BlockLookupColumnConfig[]>) => {
			dispatchLocalState({ type: 'draft-column-config-changed', updater });
		},
		[dispatchLocalState]
	);
	const setDraftSmallRows = useCallback(
		(smallRows: boolean) => {
			dispatchLocalState({ type: 'draft-small-rows-changed', smallRows });
		},
		[dispatchLocalState]
	);
	const closeTableOptions = useCallback(() => {
		dispatchLocalState({ type: 'table-options-closed' });
	}, [dispatchLocalState]);
	const setDraggingHeaderColumnKey = useCallback(
		(columnKey?: BlockLookupColumnKey) => {
			dispatchLocalState({ type: 'dragging-header-column-changed', columnKey });
		},
		[dispatchLocalState]
	);
	const setDraggingDraftColumnKey = useCallback(
		(columnKey?: BlockLookupColumnKey) => {
			dispatchLocalState({ type: 'dragging-draft-column-changed', columnKey });
		},
		[dispatchLocalState]
	);
	const moveDraftColumn = useCallback(
		(columnKey: BlockLookupColumnKey, direction: -1 | 1) => {
			setDraftColumnConfig((columns) => moveDraftColumnByDirection(columns, columnKey, direction));
		},
		[setDraftColumnConfig]
	);
	return {
		setDraftColumnConfig,
		setDraftSmallRows,
		closeTableOptions,
		setDraggingHeaderColumnKey,
		setDraggingDraftColumnKey,
		moveDraftColumn
	};
}

export function useBlockLookupTableSettings(
	appState: Pick<AppState, 'config' | 'updateState'>,
	openNotification: ReturnType<typeof useBlockLookupWorkflow>['openNotification']
) {
	const { config: appConfig, updateState } = appState;
	const {
		saveBlockLookupColumns,
		setBlockLookupColumnOrder,
		setBlockLookupColumnWidth: persistBlockLookupColumnWidth
	} = useViewConfigCommands({ config: appConfig, openNotification, updateState });
	const blockLookupConfig = appConfig.viewConfigs.blockLookup;
	const columnConfig = useMemo(() => getConfiguredBlockLookupColumns(blockLookupConfig), [blockLookupConfig]);
	const columnConfigRef = useRef(columnConfig);
	const [localState, dispatchLocalState] = useReducer(
		reduceBlockLookupTableWorkspace,
		{ columnConfig, smallRows: blockLookupConfig?.smallRows },
		createBlockLookupTableWorkspaceState
	);
	const { draftColumnConfig, draftSmallRows, draggingDraftColumnKey, draggingHeaderColumnKey, savingTableOptions, tableOptionsOpen } =
		localState;
	const {
		setDraftColumnConfig,
		setDraftSmallRows,
		closeTableOptions,
		setDraggingHeaderColumnKey,
		setDraggingDraftColumnKey,
		moveDraftColumn
	} = useTableSettingsActions(dispatchLocalState);
	useEffect(() => {
		columnConfigRef.current = columnConfig;
	}, [columnConfig]);

	const { availableTableWidth, tablePaneRef } = useBlockLookupTableWidth();

	const openTableOptions = useCallback(() => {
		const draft = createBlockLookupTableOptionsDraft(blockLookupConfig);
		dispatchLocalState({ type: 'table-options-opened', draft });
	}, [blockLookupConfig]);

	const saveTableOptions = useCallback(
		() => saveTableOptionsDraft(dispatchLocalState, saveBlockLookupColumns, draftColumnConfig, draftSmallRows),
		[draftColumnConfig, draftSmallRows, saveBlockLookupColumns]
	);

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

	return {
		blockLookupConfig,
		columnConfig,
		availableTableWidth,
		draftColumnConfig,
		draftSmallRows,
		draggingDraftColumnKey,
		draggingHeaderColumnKey,
		savingTableOptions,
		tableOptionsOpen,
		setDraftColumnConfig,
		setDraftSmallRows,
		closeTableOptions,
		setDraggingHeaderColumnKey,
		setDraggingDraftColumnKey,
		moveDraftColumn,
		tablePaneRef,
		openTableOptions,
		saveTableOptions,
		persistColumnOrder,
		persistColumnWidth,
		persistColumnVisibility
	};
}

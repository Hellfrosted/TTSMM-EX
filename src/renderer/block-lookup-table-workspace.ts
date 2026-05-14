import type { BlockLookupColumnKey } from 'model';
import type { SetStateAction } from 'react';
import type { BlockLookupColumnConfig } from './block-lookup-column-definitions';

export type { BlockLookupColumnKey } from 'model';
export type BlockLookupSortKey = 'relevance' | BlockLookupColumnKey;
export type BlockLookupSortDirection = 'ascend' | 'descend';

export interface BlockLookupTableWorkspaceState {
	availableTableWidth: number;
	draftColumnConfig: BlockLookupColumnConfig[];
	draftSmallRows: boolean;
	draggingDraftColumnKey?: BlockLookupColumnKey;
	draggingHeaderColumnKey?: BlockLookupColumnKey;
	savingTableOptions: boolean;
	tableOptionsOpen: boolean;
}

export type BlockLookupTableWorkspaceEvent =
	| { type: 'available-table-width-changed'; width: number }
	| { type: 'table-options-opened'; draft: { columns: BlockLookupColumnConfig[]; smallRows: boolean } }
	| { type: 'table-options-closed' }
	| { type: 'saving-table-options-changed'; saving: boolean }
	| { type: 'draft-small-rows-changed'; smallRows: boolean }
	| { type: 'draft-column-config-changed'; updater: SetStateAction<BlockLookupColumnConfig[]> }
	| { type: 'dragging-header-column-changed'; columnKey?: BlockLookupColumnKey }
	| { type: 'dragging-draft-column-changed'; columnKey?: BlockLookupColumnKey };

export function createBlockLookupTableWorkspaceState(input: {
	columnConfig: BlockLookupColumnConfig[];
	smallRows?: boolean;
}): BlockLookupTableWorkspaceState {
	return {
		availableTableWidth: 0,
		draftColumnConfig: input.columnConfig,
		draftSmallRows: !!input.smallRows,
		draggingDraftColumnKey: undefined,
		draggingHeaderColumnKey: undefined,
		savingTableOptions: false,
		tableOptionsOpen: false
	};
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

export function reduceBlockLookupTableWorkspace(
	state: BlockLookupTableWorkspaceState,
	event: BlockLookupTableWorkspaceEvent
): BlockLookupTableWorkspaceState {
	switch (event.type) {
		case 'available-table-width-changed':
			return state.availableTableWidth === event.width ? state : { ...state, availableTableWidth: event.width };
		case 'table-options-opened':
			return {
				...state,
				draftColumnConfig: event.draft.columns,
				draftSmallRows: event.draft.smallRows,
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
				savingTableOptions: event.saving
			};
		case 'draft-small-rows-changed':
			return {
				...state,
				draftSmallRows: event.smallRows
			};
		case 'draft-column-config-changed': {
			const nextConfig = typeof event.updater === 'function' ? event.updater(state.draftColumnConfig) : event.updater;
			return {
				...state,
				draftColumnConfig: nextConfig
			};
		}
		case 'dragging-header-column-changed':
			return {
				...state,
				draggingHeaderColumnKey: event.columnKey
			};
		case 'dragging-draft-column-changed':
			return {
				...state,
				draggingDraftColumnKey: event.columnKey
			};
	}
}

function clampBlockLookupTableNavigationIndex(value: number, rowCount: number) {
	return Math.min(Math.max(value, 0), rowCount - 1);
}

export function getBlockLookupKeyboardNavigationIndex(key: string, currentIndex: number | undefined, rowCount: number) {
	if (rowCount <= 0) {
		return undefined;
	}
	if (key === 'ArrowUp') {
		return currentIndex === undefined || currentIndex < 0 ? 0 : clampBlockLookupTableNavigationIndex(currentIndex - 1, rowCount);
	}
	if (key === 'ArrowDown') {
		return currentIndex === undefined || currentIndex < 0 ? 0 : clampBlockLookupTableNavigationIndex(currentIndex + 1, rowCount);
	}
	if (key === 'Home') {
		return 0;
	}
	if (key === 'End') {
		return rowCount - 1;
	}
	return undefined;
}

import type { BlockLookupColumnKey, BlockLookupViewConfig } from 'model';
import { cloneBlockLookupColumnConfig, type BlockLookupColumnConfig } from './block-lookup-column-definitions';
import { getConfiguredBlockLookupColumns } from './block-lookup-column-config';

interface BlockLookupTableOptionsDraft {
	columns: BlockLookupColumnConfig[];
	smallRows: boolean;
}

interface BlockLookupDraftColumnState {
	cannotHide: boolean;
	column: BlockLookupColumnConfig;
}

export function moveBlockLookupColumnByKey(columns: BlockLookupColumnConfig[], fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) {
	const fromIndex = columns.findIndex((column) => column.key === fromKey);
	const toIndex = columns.findIndex((column) => column.key === toKey);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
		return columns;
	}

	const nextColumns = cloneBlockLookupColumnConfig(columns);
	const [column] = nextColumns.splice(fromIndex, 1);
	nextColumns.splice(toIndex, 0, column);
	return nextColumns;
}

export function createBlockLookupTableOptionsDraft(config?: BlockLookupViewConfig): BlockLookupTableOptionsDraft {
	return {
		columns: getConfiguredBlockLookupColumns(config),
		smallRows: !!config?.smallRows
	};
}

export function getBlockLookupDraftColumnStates(columns: BlockLookupColumnConfig[]): BlockLookupDraftColumnState[] {
	const visibleColumns = columns.filter((column) => column.visible).length;
	return columns.map((column) => ({
		column,
		cannotHide: column.visible && visibleColumns <= 1
	}));
}

export function setBlockLookupDraftColumnVisibility(columns: BlockLookupColumnConfig[], columnKey: BlockLookupColumnKey, visible: boolean) {
	const visibleColumns = columns.filter((column) => column.visible).length;
	if (!visible && visibleColumns <= 1) {
		return columns;
	}

	return columns.map((column) => (column.key === columnKey ? { ...column, visible } : column));
}

export function setBlockLookupDraftColumnWidth(
	columns: BlockLookupColumnConfig[],
	columnKey: BlockLookupColumnKey,
	width: number | undefined
) {
	return columns.map((column) => {
		if (column.key !== columnKey) {
			return column;
		}
		if (typeof width !== 'number') {
			const nextColumn = { ...column };
			delete nextColumn.width;
			return nextColumn;
		}

		return { ...column, width: Math.max(column.minWidth, Math.round(width)) };
	});
}

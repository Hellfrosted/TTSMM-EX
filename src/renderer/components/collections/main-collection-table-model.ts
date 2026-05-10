import { MainColumnTitles, type DisplayModData, type MainCollectionConfig } from 'model';
import { getCollectionSelectionState, setVisibleCollectionRowsSelected } from 'renderer/collection-mod-selection';
import { measurePerf } from 'renderer/perf';
import type { MainSortState } from 'renderer/state/main-collection-table-store';
import {
	ALL_MAIN_COLUMN_TITLES,
	getActiveMainColumnTitles,
	getColumnWidths,
	getResponsiveMainColumnTitles
} from './main-collection-table-layout';

interface MainCollectionTableModelInput {
	config?: MainCollectionConfig;
	autoColumnWidths?: Record<string, number>;
	availableTableWidth?: number;
}

interface MainCollectionTableModel {
	manuallyActiveColumnTitles: MainColumnTitles[];
	activeColumnTitles: MainColumnTitles[];
	hiddenColumnTitles: MainColumnTitles[];
	resolvedColumnWidths: Record<string, number>;
}

type MainCollectionSortOrder = 'ascend' | 'descend' | null | undefined;

export type MainCollectionSorter =
	| ((a: DisplayModData, b: DisplayModData, sortOrder?: MainCollectionSortOrder) => number)
	| { compare?: (a: DisplayModData, b: DisplayModData, sortOrder?: MainCollectionSortOrder) => number }
	| undefined;

interface MainCollectionSortableColumn {
	title: string;
	sorter?: MainCollectionSorter;
}

export function createMainCollectionTableModel({
	config,
	autoColumnWidths,
	availableTableWidth = 0
}: MainCollectionTableModelInput): MainCollectionTableModel {
	const manuallyActiveColumnTitles = getActiveMainColumnTitles(config);
	const activeColumnTitles = getResponsiveMainColumnTitles(config, availableTableWidth);
	const activeColumnTitleSet = new Set(manuallyActiveColumnTitles);
	const hiddenColumnTitles = ALL_MAIN_COLUMN_TITLES.filter((columnTitle) => !activeColumnTitleSet.has(columnTitle));
	const resolvedColumnWidths = getColumnWidths(config, autoColumnWidths, availableTableWidth);

	return {
		manuallyActiveColumnTitles,
		activeColumnTitles,
		hiddenColumnTitles,
		resolvedColumnWidths
	};
}

export function getMainCollectionSorterCompare(sorter: MainCollectionSorter) {
	if (typeof sorter === 'function') {
		return sorter;
	}

	if (sorter && typeof sorter === 'object' && 'compare' in sorter && typeof sorter.compare === 'function') {
		return sorter.compare;
	}

	return undefined;
}

export function getMainCollectionDefaultSortState(columns: MainCollectionSortableColumn[], currentSortState: MainSortState) {
	if (columns.some((column) => column.title === currentSortState.columnTitle && getMainCollectionSorterCompare(column.sorter))) {
		return currentSortState;
	}

	const defaultColumn =
		columns.find((column) => column.title === MainColumnTitles.NAME && getMainCollectionSorterCompare(column.sorter)) ??
		columns.find((column) => getMainCollectionSorterCompare(column.sorter));

	return defaultColumn ? { columnTitle: defaultColumn.title, order: 'ascend' as const } : currentSortState;
}

export function sortMainCollectionRows(rows: DisplayModData[], columns: MainCollectionSortableColumn[], sortState: MainSortState) {
	return measurePerf(
		'collection.table.sortRows',
		() => {
			const column = columns.find((candidate) => candidate.title === sortState.columnTitle);
			const compare = getMainCollectionSorterCompare(column?.sorter);
			if (!compare) {
				return rows;
			}

			const direction = sortState.order === 'ascend' ? 1 : -1;
			return [...rows].sort((left, right) => direction * compare(left, right, sortState.order));
		},
		{
			rows: rows.length,
			column: sortState.columnTitle,
			order: sortState.order
		}
	);
}

export function getMainCollectionSelectionModel(collectionMods: string[], visibleRows: DisplayModData[]) {
	const selectionState = getCollectionSelectionState(collectionMods, visibleRows);

	return {
		...selectionState,
		getNextCollectionMods: (selected: boolean) => setVisibleCollectionRowsSelected(collectionMods, visibleRows, selected)
	};
}

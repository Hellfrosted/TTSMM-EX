import { MainColumnTitles, type MainCollectionConfig } from 'model';
import { ALL_MAIN_COLUMN_TITLES, getActiveMainColumnTitles, getResponsiveMainColumnTitles } from './main-collection-table-layout';

interface MainCollectionTableModelInput {
	config?: MainCollectionConfig;
	availableTableWidth?: number;
}

interface MainCollectionTableModel {
	manuallyActiveColumnTitles: MainColumnTitles[];
	activeColumnTitles: MainColumnTitles[];
	hiddenColumnTitles: MainColumnTitles[];
}

export function createMainCollectionTableModel({
	config,
	availableTableWidth = 0
}: MainCollectionTableModelInput): MainCollectionTableModel {
	const manuallyActiveColumnTitles = getActiveMainColumnTitles(config);
	const activeColumnTitles = getResponsiveMainColumnTitles(config, availableTableWidth);
	const activeColumnTitleSet = new Set(manuallyActiveColumnTitles);
	const hiddenColumnTitles = ALL_MAIN_COLUMN_TITLES.filter((columnTitle) => !activeColumnTitleSet.has(columnTitle));

	return {
		manuallyActiveColumnTitles,
		activeColumnTitles,
		hiddenColumnTitles
	};
}

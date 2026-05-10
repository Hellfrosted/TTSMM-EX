import { create } from 'zustand';
import { MainColumnTitles } from 'model';

export type MainSortOrder = 'ascend' | 'descend';

export interface MainSortState {
	columnTitle: string;
	order: MainSortOrder;
}

interface MainCollectionTableState {
	sortState: MainSortState;
	setSortState: (nextSortState: MainSortState | ((currentSortState: MainSortState) => MainSortState)) => void;
}

export const useMainCollectionTableStore = create<MainCollectionTableState>((set) => ({
	sortState: { columnTitle: MainColumnTitles.NAME, order: 'ascend' },
	setSortState: (nextSortState) => {
		set((state) => ({
			sortState: typeof nextSortState === 'function' ? nextSortState(state.sortState) : nextSortState
		}));
	}
}));

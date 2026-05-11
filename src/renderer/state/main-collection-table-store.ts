import { useAtomRef } from '@effect/atom-react';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import { MainColumnTitles } from 'model';

type MainSortOrder = 'ascend' | 'descend';

export interface MainSortState {
	columnTitle: string;
	order: MainSortOrder;
}

export interface MainCollectionTableState {
	sortState: MainSortState;
	setSortState: (nextSortState: MainSortState | ((currentSortState: MainSortState) => MainSortState)) => void;
}

const mainCollectionTableStateRef = AtomRef.make<MainCollectionTableState>({
	sortState: { columnTitle: MainColumnTitles.NAME, order: 'ascend' },
	setSortState: (nextSortState) => {
		mainCollectionTableStateRef.update((state) => ({
			...state,
			sortState: typeof nextSortState === 'function' ? nextSortState(state.sortState) : nextSortState
		}));
	}
});

export function useMainCollectionTableStore<T>(selector: (state: MainCollectionTableState) => T) {
	return selector(useAtomRef(mainCollectionTableStateRef));
}

import { useAtomRef } from '@effect/atom-react';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { BlockLookupColumnKey } from 'model';

export type { BlockLookupColumnKey } from 'model';
export type BlockLookupSortKey = 'relevance' | BlockLookupColumnKey;
export type BlockLookupSortDirection = 'ascend' | 'descend';

interface BlockLookupState {
	sortKey: BlockLookupSortKey;
	sortDirection: BlockLookupSortDirection;
	setSortKey: (sortKey: BlockLookupSortKey) => void;
	setSortDirection: (
		nextDirection: BlockLookupSortDirection | ((currentDirection: BlockLookupSortDirection) => BlockLookupSortDirection)
	) => void;
}

const blockLookupStateRef = AtomRef.make<BlockLookupState>({
	sortKey: 'relevance',
	sortDirection: 'ascend',
	setSortKey: (sortKey) => {
		blockLookupStateRef.update((state) => ({ ...state, sortKey }));
	},
	setSortDirection: (nextDirection) => {
		blockLookupStateRef.update((state) => ({
			...state,
			sortDirection: typeof nextDirection === 'function' ? nextDirection(state.sortDirection) : nextDirection
		}));
	}
});

export function useBlockLookupStore<T>(selector: (state: BlockLookupState) => T) {
	return selector(useAtomRef(blockLookupStateRef));
}

import { useAtomRef } from '@effect/atom-react';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { BlockLookupColumnKey } from 'renderer/block-lookup-table-workspace';
import {
	type BlockLookupSortDirection,
	type BlockLookupSortKey,
	getNextBlockLookupSortDirection
} from 'renderer/block-lookup-table-workspace';

interface BlockLookupState {
	sortKey: BlockLookupSortKey;
	sortDirection: BlockLookupSortDirection;
	requestSortColumn: (columnKey: BlockLookupColumnKey) => void;
}

const blockLookupStateRef = AtomRef.make<BlockLookupState>({
	sortKey: 'relevance',
	sortDirection: 'ascend',
	requestSortColumn: (columnKey) => {
		blockLookupStateRef.update((state) => ({
			...state,
			sortDirection: getNextBlockLookupSortDirection(state.sortKey, state.sortDirection, columnKey),
			sortKey: columnKey
		}));
	}
});

export function useBlockLookupStore<T>(selector: (state: BlockLookupState) => T) {
	return selector(useAtomRef(blockLookupStateRef));
}

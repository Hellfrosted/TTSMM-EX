import { create } from 'zustand';

export type BlockLookupColumnKey = 'spawnCommand' | 'blockName' | 'internalName' | 'modTitle';
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

export const useBlockLookupStore = create<BlockLookupState>((set) => ({
	sortKey: 'relevance',
	sortDirection: 'ascend',
	setSortKey: (sortKey) => {
		set({ sortKey });
	},
	setSortDirection: (nextDirection) => {
		set((state) => ({
			sortDirection: typeof nextDirection === 'function' ? nextDirection(state.sortDirection) : nextDirection
		}));
	}
}));

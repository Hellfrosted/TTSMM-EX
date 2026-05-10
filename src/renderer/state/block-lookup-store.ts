import { create } from 'zustand';

export type BlockLookupColumnKey = 'spawnCommand' | 'blockName' | 'internalName' | 'modTitle';
export type BlockLookupSortKey = 'relevance' | BlockLookupColumnKey;
export type BlockLookupSortDirection = 'ascend' | 'descend';

interface BlockLookupState {
	query: string;
	selectedRowKey?: string;
	sortKey: BlockLookupSortKey;
	sortDirection: BlockLookupSortDirection;
	buildingIndex: boolean;
	setQuery: (query: string) => void;
	setSelectedRowKey: (nextKey: string | undefined | ((currentKey?: string) => string | undefined)) => void;
	setSortKey: (sortKey: BlockLookupSortKey) => void;
	setSortDirection: (
		nextDirection: BlockLookupSortDirection | ((currentDirection: BlockLookupSortDirection) => BlockLookupSortDirection)
	) => void;
	setBuildingIndex: (buildingIndex: boolean) => void;
}

export const useBlockLookupStore = create<BlockLookupState>((set) => ({
	query: '',
	sortKey: 'relevance',
	sortDirection: 'ascend',
	buildingIndex: false,
	setQuery: (query) => {
		set({ query });
	},
	setSelectedRowKey: (nextKey) => {
		set((state) => ({
			selectedRowKey: typeof nextKey === 'function' ? nextKey(state.selectedRowKey) : nextKey
		}));
	},
	setSortKey: (sortKey) => {
		set({ sortKey });
	},
	setSortDirection: (nextDirection) => {
		set((state) => ({
			sortDirection: typeof nextDirection === 'function' ? nextDirection(state.sortDirection) : nextDirection
		}));
	},
	setBuildingIndex: (buildingIndex) => {
		set({ buildingIndex });
	}
}));

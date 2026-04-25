import { create } from 'zustand';
import type { BlockLookupIndexStats, BlockLookupRecord } from 'shared/block-lookup';

export type BlockLookupColumnKey = 'spawnCommand' | 'blockName' | 'modTitle' | 'blockId' | 'sourceKind';
export type BlockLookupSortKey = 'relevance' | BlockLookupColumnKey;
export type BlockLookupSortDirection = 'ascend' | 'descend';

interface BlockLookupState {
	query: string;
	rows: BlockLookupRecord[];
	stats: BlockLookupIndexStats | null;
	selectedRowKey?: string;
	sortKey: BlockLookupSortKey;
	sortDirection: BlockLookupSortDirection;
	loadingResults: boolean;
	buildingIndex: boolean;
	setQuery: (query: string) => void;
	setRows: (rows: BlockLookupRecord[]) => void;
	setStats: (stats: BlockLookupIndexStats | null) => void;
	setSelectedRowKey: (nextKey: string | undefined | ((currentKey?: string) => string | undefined)) => void;
	setSortKey: (sortKey: BlockLookupSortKey) => void;
	setSortDirection: (nextDirection: BlockLookupSortDirection | ((currentDirection: BlockLookupSortDirection) => BlockLookupSortDirection)) => void;
	setLoadingResults: (loadingResults: boolean) => void;
	setBuildingIndex: (buildingIndex: boolean) => void;
}

export const useBlockLookupStore = create<BlockLookupState>((set) => ({
	query: '',
	rows: [],
	stats: null,
	sortKey: 'relevance',
	sortDirection: 'ascend',
	loadingResults: false,
	buildingIndex: false,
	setQuery: (query) => {
		set({ query });
	},
	setRows: (rows) => {
		set({ rows });
	},
	setStats: (stats) => {
		set({ stats });
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
	setLoadingResults: (loadingResults) => {
		set({ loadingResults });
	},
	setBuildingIndex: (buildingIndex) => {
		set({ buildingIndex });
	}
}));

import type { QueryClient } from '@tanstack/react-query';
import type { BlockLookupIndexStats, BlockLookupSettings } from 'shared/block-lookup';

type BlockLookupBootstrapQueryData = readonly [BlockLookupSettings, BlockLookupIndexStats | null];

export const queryKeys = {
	blockLookup: {
		root: () => ['blockLookup'] as const,
		bootstrap: () => [...queryKeys.blockLookup.root(), 'bootstrap'] as const,
		searchRoot: () => [...queryKeys.blockLookup.root(), 'search'] as const,
		search: (query: string, limit: number) => [...queryKeys.blockLookup.searchRoot(), query, limit] as const
	}
};

export function setBlockLookupBootstrapQueryData(queryClient: QueryClient, data: BlockLookupBootstrapQueryData) {
	queryClient.setQueryData(queryKeys.blockLookup.bootstrap(), data);
}

export function invalidateBlockLookupSearchQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: queryKeys.blockLookup.searchRoot() });
}

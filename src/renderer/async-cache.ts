import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppConfig } from 'model';
import api from 'renderer/Api';
import type { BlockLookupIndexStats, BlockLookupSettings } from 'shared/block-lookup';

type BlockLookupBootstrapQueryData = readonly [BlockLookupSettings, BlockLookupIndexStats | null];

export const queryKeys = {
	config: {
		root: () => ['config'] as const,
		current: () => [...queryKeys.config.root(), 'current'] as const
	},
	collections: {
		root: () => ['collections'] as const,
		list: () => [...queryKeys.collections.root(), 'list'] as const,
		detail: (collectionName: string) => [...queryKeys.collections.root(), 'detail', collectionName] as const
	},
	blockLookup: {
		root: () => ['blockLookup'] as const,
		bootstrap: () => [...queryKeys.blockLookup.root(), 'bootstrap'] as const,
		searchRoot: () => [...queryKeys.blockLookup.root(), 'search'] as const,
		search: (query: string, limit: number) => [...queryKeys.blockLookup.searchRoot(), query, limit] as const
	}
};

export function configQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.config.current(),
		queryFn: () => api.readConfig()
	});
}

export function setConfigQueryData(queryClient: QueryClient, config: AppConfig | null) {
	queryClient.setQueryData(queryKeys.config.current(), config);
}

export async function writeConfigMutationFn(nextConfig: AppConfig) {
	const updateSuccess = await api.updateConfig(nextConfig);
	if (!updateSuccess) {
		throw new Error('Config write was rejected');
	}
	return nextConfig;
}

export function useWriteConfigMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: writeConfigMutationFn,
		onSuccess: (nextConfig) => {
			setConfigQueryData(queryClient, nextConfig);
		}
	});
}

export function collectionsListQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.collections.list(),
		queryFn: async () => (await api.readCollectionsList()) || []
	});
}

export function collectionQueryOptions(collectionName: string) {
	return queryOptions({
		queryKey: queryKeys.collections.detail(collectionName),
		queryFn: () => api.readCollection(collectionName)
	});
}

export function setBlockLookupBootstrapQueryData(queryClient: QueryClient, data: BlockLookupBootstrapQueryData) {
	queryClient.setQueryData(queryKeys.blockLookup.bootstrap(), data);
}

export function invalidateBlockLookupSearchQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: queryKeys.blockLookup.searchRoot() });
}

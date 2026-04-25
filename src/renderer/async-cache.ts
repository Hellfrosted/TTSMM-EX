import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppConfig } from 'model';
import type { ModCollection } from 'model/ModCollection';
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

function setCollectionQueryData(queryClient: QueryClient, collection: ModCollection) {
	queryClient.setQueryData(queryKeys.collections.detail(collection.name), collection);
}

function removeCollectionQueryData(queryClient: QueryClient, collectionName: string) {
	queryClient.removeQueries({ queryKey: queryKeys.collections.detail(collectionName), exact: true });
}

function invalidateCollectionQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: queryKeys.collections.root() });
}

function addCollectionNameToList(queryClient: QueryClient, collectionName: string) {
	queryClient.setQueryData<string[]>(queryKeys.collections.list(), (currentNames = []) => {
		if (currentNames.includes(collectionName)) {
			return currentNames;
		}

		return [...currentNames, collectionName];
	});
}

function removeCollectionNameFromList(queryClient: QueryClient, collectionName: string) {
	queryClient.setQueryData<string[]>(queryKeys.collections.list(), (currentNames = []) =>
		currentNames.filter((currentName) => currentName !== collectionName)
	);
}

async function updateCollectionMutationFn(collection: ModCollection) {
	const updateSuccess = await api.updateCollection(collection);
	if (!updateSuccess) {
		throw new Error(`Collection write was rejected: ${collection.name}`);
	}

	return collection;
}

async function deleteCollectionMutationFn(collectionName: string) {
	const deleteSuccess = await api.deleteCollection(collectionName);
	if (!deleteSuccess) {
		throw new Error(`Collection delete was rejected: ${collectionName}`);
	}

	return collectionName;
}

interface RenameCollectionMutationVariables {
	collection: ModCollection;
	newName: string;
}

async function renameCollectionMutationFn({ collection, newName }: RenameCollectionMutationVariables) {
	const renameSuccess = await api.renameCollection(collection, newName);
	if (!renameSuccess) {
		throw new Error(`Collection rename was rejected: ${collection.name} -> ${newName}`);
	}

	return {
		previousName: collection.name,
		collection: {
			...collection,
			name: newName
		}
	};
}

export function useUpdateCollectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: updateCollectionMutationFn,
		onSuccess: (collection) => {
			setCollectionQueryData(queryClient, collection);
			addCollectionNameToList(queryClient, collection.name);
			return invalidateCollectionQueries(queryClient);
		}
	});
}

export function useDeleteCollectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: deleteCollectionMutationFn,
		onSuccess: (collectionName) => {
			removeCollectionQueryData(queryClient, collectionName);
			removeCollectionNameFromList(queryClient, collectionName);
			return invalidateCollectionQueries(queryClient);
		}
	});
}

export function useRenameCollectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: renameCollectionMutationFn,
		onSuccess: ({ previousName, collection }) => {
			removeCollectionQueryData(queryClient, previousName);
			setCollectionQueryData(queryClient, collection);
			queryClient.setQueryData<string[]>(queryKeys.collections.list(), (currentNames = []) =>
				currentNames.map((currentName) => (currentName === previousName ? collection.name : currentName))
			);
			return invalidateCollectionQueries(queryClient);
		}
	});
}

export function setBlockLookupBootstrapQueryData(queryClient: QueryClient, data: BlockLookupBootstrapQueryData) {
	queryClient.setQueryData(queryKeys.blockLookup.bootstrap(), data);
}

export function invalidateBlockLookupSearchQueries(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: queryKeys.blockLookup.searchRoot() });
}

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	collectionQueryOptions,
	collectionsListQueryOptions,
	configQueryOptions,
	queryKeys,
	useDeleteCollectionMutation,
	useRenameCollectionMutation,
	useUpdateCollectionMutation,
	useWriteConfigMutation
} from '../../renderer/async-cache';
import { createQueryWrapper, createTestQueryClient } from './test-utils';

function spyOnCollectionRefetch(queryClient: QueryClient) {
	return {
		invalidateQueries: vi.spyOn(queryClient, 'invalidateQueries'),
		refetchQueries: vi.spyOn(queryClient, 'refetchQueries')
	};
}

function expectNoCollectionRefetch(spies: ReturnType<typeof spyOnCollectionRefetch>) {
	expect(spies.invalidateQueries).not.toHaveBeenCalled();
	expect(spies.refetchQueries).not.toHaveBeenCalled();
}

describe('renderer async cache', () => {
	it('loads config through query options and updates the config cache after writes', async () => {
		const queryClient = createTestQueryClient();
		const storedConfig: AppConfig = {
			...DEFAULT_CONFIG,
			currentPath: '/settings',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		const nextConfig: AppConfig = {
			...storedConfig,
			currentPath: '/collections/main'
		};
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce(storedConfig);

		await expect(queryClient.fetchQuery(configQueryOptions())).resolves.toBe(storedConfig);
		expect(queryClient.getQueryData(queryKeys.config.current())).toBe(storedConfig);

		const { result } = renderHook(() => useWriteConfigMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync(nextConfig);
		});

		expect(window.electron.updateConfig).toHaveBeenCalledWith(nextConfig);
		expect(queryClient.getQueryData(queryKeys.config.current())).toEqual(nextConfig);
	});

	it('updates collection detail and list cache entries after collection writes', async () => {
		const queryClient = createTestQueryClient();
		queryClient.setQueryData(queryKeys.collections.list(), ['default']);
		const collection = { name: 'fresh', mods: ['local:mod-a'] };
		const refetchSpies = spyOnCollectionRefetch(queryClient);

		const { result } = renderHook(() => useUpdateCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync(collection);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith(collection);
		expect(queryClient.getQueryData(queryKeys.collections.detail('fresh'))).toBe(collection);
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['default', 'fresh']);
		expectNoCollectionRefetch(refetchSpies);
	});

	it('does not refetch observed collection queries after exact collection writes', async () => {
		const queryClient = createTestQueryClient();
		const storedCollection = { name: 'fresh', mods: ['local:old'] };
		const nextCollection = { name: 'fresh', mods: ['local:new'] };
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce(['fresh']);
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce(storedCollection);

		const { result } = renderHook(
			() => {
				useQuery(collectionsListQueryOptions());
				useQuery(collectionQueryOptions('fresh'));
				return useUpdateCollectionMutation();
			},
			{ wrapper: createQueryWrapper(queryClient) }
		);

		await waitFor(() => {
			expect(window.electron.readCollectionsList).toHaveBeenCalledTimes(1);
			expect(window.electron.readCollection).toHaveBeenCalledTimes(1);
		});
		vi.mocked(window.electron.readCollectionsList).mockClear();
		vi.mocked(window.electron.readCollection).mockClear();

		await act(async () => {
			await result.current.mutateAsync(nextCollection);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith(nextCollection);
		expect(window.electron.readCollectionsList).not.toHaveBeenCalled();
		expect(window.electron.readCollection).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(queryKeys.collections.detail('fresh'))).toEqual(nextCollection);
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['fresh']);
	});

	it('removes collection detail and list cache entries after collection deletes', async () => {
		const queryClient = createTestQueryClient();
		queryClient.setQueryData(queryKeys.collections.list(), ['default', 'archived']);
		queryClient.setQueryData(queryKeys.collections.detail('archived'), { name: 'archived', mods: [] });
		const refetchSpies = spyOnCollectionRefetch(queryClient);

		const { result } = renderHook(() => useDeleteCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync('archived');
		});

		expect(window.electron.deleteCollection).toHaveBeenCalledWith('archived');
		expect(queryClient.getQueryData(queryKeys.collections.detail('archived'))).toBeUndefined();
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['default']);
		expectNoCollectionRefetch(refetchSpies);
	});

	it('moves collection detail and list cache entries after collection renames', async () => {
		const queryClient = createTestQueryClient();
		const collection = { name: 'default', mods: ['local:mod-a'] };
		queryClient.setQueryData(queryKeys.collections.list(), ['default']);
		queryClient.setQueryData(queryKeys.collections.detail('default'), collection);
		const refetchSpies = spyOnCollectionRefetch(queryClient);

		const { result } = renderHook(() => useRenameCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync({ collection, newName: 'renamed' });
		});

		expect(window.electron.renameCollection).toHaveBeenCalledWith(collection, 'renamed');
		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBeUndefined();
		expect(queryClient.getQueryData(queryKeys.collections.detail('renamed'))).toEqual({ name: 'renamed', mods: ['local:mod-a'] });
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['renamed']);
		expectNoCollectionRefetch(refetchSpies);
	});

	it('loads individual collections through query options', async () => {
		const queryClient = createTestQueryClient();
		const collection = { name: 'default', mods: [] };
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce(collection);

		await expect(queryClient.fetchQuery(collectionQueryOptions('default'))).resolves.toBe(collection);

		expect(window.electron.readCollection).toHaveBeenCalledWith('default');
		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBe(collection);
	});
});

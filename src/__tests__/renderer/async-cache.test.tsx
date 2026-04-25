import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	collectionQueryOptions,
	configQueryOptions,
	queryKeys,
	useDeleteCollectionMutation,
	useRenameCollectionMutation,
	useUpdateCollectionMutation,
	useWriteConfigMutation
} from '../../renderer/async-cache';

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: Infinity,
				retry: false
			}
		}
	});
}

function createQueryWrapper(queryClient: QueryClient) {
	return function QueryWrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe('renderer async cache', () => {
	it('loads config through query options and updates the config cache after writes', async () => {
		const queryClient = createQueryClient();
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
		const queryClient = createQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
		queryClient.setQueryData(queryKeys.collections.list(), ['default']);
		const collection = { name: 'fresh', mods: ['local:mod-a'] };

		const { result } = renderHook(() => useUpdateCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync(collection);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith(collection);
		expect(queryClient.getQueryData(queryKeys.collections.detail('fresh'))).toBe(collection);
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['default', 'fresh']);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.collections.root() });
	});

	it('removes collection detail and list cache entries after collection deletes', async () => {
		const queryClient = createQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
		queryClient.setQueryData(queryKeys.collections.list(), ['default', 'archived']);
		queryClient.setQueryData(queryKeys.collections.detail('archived'), { name: 'archived', mods: [] });

		const { result } = renderHook(() => useDeleteCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync('archived');
		});

		expect(window.electron.deleteCollection).toHaveBeenCalledWith('archived');
		expect(queryClient.getQueryData(queryKeys.collections.detail('archived'))).toBeUndefined();
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['default']);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.collections.root() });
	});

	it('moves collection detail and list cache entries after collection renames', async () => {
		const queryClient = createQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
		const collection = { name: 'default', mods: ['local:mod-a'] };
		queryClient.setQueryData(queryKeys.collections.list(), ['default']);
		queryClient.setQueryData(queryKeys.collections.detail('default'), collection);

		const { result } = renderHook(() => useRenameCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync({ collection, newName: 'renamed' });
		});

		expect(window.electron.renameCollection).toHaveBeenCalledWith(collection, 'renamed');
		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBeUndefined();
		expect(queryClient.getQueryData(queryKeys.collections.detail('renamed'))).toEqual({ name: 'renamed', mods: ['local:mod-a'] });
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['renamed']);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.collections.root() });
	});

	it('loads individual collections through query options', async () => {
		const queryClient = createQueryClient();
		const collection = { name: 'default', mods: [] };
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce(collection);

		await expect(queryClient.fetchQuery(collectionQueryOptions('default'))).resolves.toBe(collection);

		expect(window.electron.readCollection).toHaveBeenCalledWith('default');
		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBe(collection);
	});
});

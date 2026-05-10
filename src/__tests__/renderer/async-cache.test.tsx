import { useQuery, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import type { ElectronApi } from '../../shared/electron-api';
import {
	applyCollectionLifecycleResultToCache,
	blockLookupBootstrapQueryOptions,
	blockLookupSearchQueryOptions,
	collectionQueryOptions,
	collectionsListQueryOptions,
	configQueryOptions,
	createModMetadataScanRequest,
	fetchBlockLookupBootstrap,
	fetchBlockLookupSearch,
	queryKeys,
	useBuildBlockLookupIndexMutation,
	useUpdateCollectionMutation,
	useWriteConfigMutation
} from '../../renderer/async-cache';
import { persistConfigChange, writeConfig } from '../../renderer/util/config-write';
import { createQueryWrapper, createTestQueryClient } from './test-utils';

declare global {
	interface Window {
		electron: ElectronApi;
	}
}

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
	it('builds stable mod metadata scan requests from collections and overrides', () => {
		const allCollections = new Map([
			['default', { name: 'default', mods: ['local:zeta', 'workshop:one'] }],
			['secondary', { name: 'secondary', mods: ['local:alpha', 'local:zeta'] }]
		]);
		const userOverrides = new Map([
			['local:zeta', { id: 'ZetaOverride', tags: ['utility', 'alpha'] }],
			['local:alpha', { tags: ['beta'] }]
		]);
		const equivalentOverrides = new Map([
			['local:alpha', { tags: ['beta'] }],
			['local:zeta', { tags: ['alpha', 'utility'], id: 'ZetaOverride' }]
		]);

		const request = createModMetadataScanRequest({
			allCollections,
			workshopID: DEFAULT_CONFIG.workshopID,
			forceReload: false,
			userOverrides
		});
		const equivalentRequest = createModMetadataScanRequest({
			allCollections: new Map([...allCollections].reverse()),
			workshopID: DEFAULT_CONFIG.workshopID,
			forceReload: false,
			userOverrides: equivalentOverrides
		});
		const forceReloadRequest = createModMetadataScanRequest({
			allCollections,
			workshopID: DEFAULT_CONFIG.workshopID,
			forceReload: true,
			userOverrides
		});

		expect(request.knownModIds).toEqual(['local:alpha', 'local:zeta', `workshop:${DEFAULT_CONFIG.workshopID}`, 'workshop:one']);
		expect(request.userOverridesKey).toEqual([
			['local:alpha', null, ['beta']],
			['local:zeta', 'ZetaOverride', ['alpha', 'utility']]
		]);
		expect(equivalentRequest.metadataScanKey).toBe(request.metadataScanKey);
		expect(forceReloadRequest.knownModIds).toEqual([`workshop:${DEFAULT_CONFIG.workshopID}`]);
	});

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

	it('writes config through the shared config persistence seam', async () => {
		const queryClient = createTestQueryClient();
		const nextConfig: AppConfig = {
			...DEFAULT_CONFIG,
			currentPath: '/block-lookup',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		const commit = vi.fn();

		await writeConfig(nextConfig, queryClient);
		expect(window.electron.updateConfig).toHaveBeenCalledWith(nextConfig);
		expect(queryClient.getQueryData(queryKeys.config.current())).toEqual(nextConfig);

		await expect(persistConfigChange(undefined, commit)).resolves.toBe(true);
		expect(commit).not.toHaveBeenCalled();

		await persistConfigChange(nextConfig, commit);
		expect(commit).toHaveBeenCalledWith(nextConfig);
	});

	it('updates collection detail cache entries after collection content writes', async () => {
		const queryClient = createTestQueryClient();
		queryClient.setQueryData(queryKeys.collections.list(), ['default']);
		const collection = { name: 'fresh', mods: ['local:mod-a'] };
		const refetchSpies = spyOnCollectionRefetch(queryClient);

		const { result } = renderHook(() => useUpdateCollectionMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync(collection);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ collectionName: 'fresh', mods: ['local:mod-a'] });
		expect(queryClient.getQueryData(queryKeys.collections.detail('fresh'))).toEqual(collection);
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['default']);
		expectNoCollectionRefetch(refetchSpies);
	});

	it('applies successful Collection Lifecycle Command results to renderer cache projections', () => {
		const queryClient = createTestQueryClient();
		const defaultCollection = { name: 'default', mods: ['local:old'] };
		const renamedCollection = { name: 'renamed', mods: ['local:new'] };
		const nextConfig: AppConfig = {
			...DEFAULT_CONFIG,
			activeCollection: 'renamed',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		queryClient.setQueryData(queryKeys.config.current(), DEFAULT_CONFIG);
		queryClient.setQueryData(queryKeys.collections.list(), ['default']);
		queryClient.setQueryData(queryKeys.collections.detail('default'), defaultCollection);

		applyCollectionLifecycleResultToCache(queryClient, {
			ok: true,
			activeCollection: renamedCollection,
			collections: [renamedCollection],
			collectionNames: ['renamed'],
			config: nextConfig
		});

		expect(queryClient.getQueryData(queryKeys.config.current())).toEqual(nextConfig);
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['renamed']);
		expect(queryClient.getQueryData(queryKeys.collections.detail('renamed'))).toBe(renamedCollection);
		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBeUndefined();
	});

	it('removes stale cached collection details when no collection list is cached', () => {
		const queryClient = createTestQueryClient();
		const defaultCollection = { name: 'default', mods: ['local:old'] };
		const renamedCollection = { name: 'renamed', mods: ['local:new'] };
		const nextConfig: AppConfig = {
			...DEFAULT_CONFIG,
			activeCollection: 'renamed',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		queryClient.setQueryData(queryKeys.collections.detail('default'), defaultCollection);

		applyCollectionLifecycleResultToCache(queryClient, {
			ok: true,
			activeCollection: renamedCollection,
			collections: [renamedCollection],
			collectionNames: ['renamed'],
			config: nextConfig
		});

		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBeUndefined();
		expect(queryClient.getQueryData(queryKeys.collections.detail('renamed'))).toBe(renamedCollection);
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

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ collectionName: 'fresh', mods: ['local:new'] });
		expect(window.electron.readCollectionsList).not.toHaveBeenCalled();
		expect(window.electron.readCollection).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(queryKeys.collections.detail('fresh'))).toEqual(nextCollection);
		expect(queryClient.getQueryData(queryKeys.collections.list())).toEqual(['fresh']);
	});

	it('loads individual collections through query options', async () => {
		const queryClient = createTestQueryClient();
		const collection = { name: 'default', mods: [] };
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce(collection);

		await expect(queryClient.fetchQuery(collectionQueryOptions('default'))).resolves.toBe(collection);

		expect(window.electron.readCollection).toHaveBeenCalledWith('default');
		expect(queryClient.getQueryData(queryKeys.collections.detail('default'))).toBe(collection);
	});

	it('loads Block Lookup bootstrap and search through named cache helpers', async () => {
		const queryClient = createTestQueryClient();
		const settings = { workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920', renderedPreviewsEnabled: false };
		const stats = {
			sources: 1,
			scanned: 1,
			skipped: 0,
			removed: 0,
			blocks: 2,
			updatedBlocks: 1,
			renderedPreviewsEnabled: false,
			renderedPreviews: 0,
			unavailablePreviews: 0,
			builtAt: new Date(0).toISOString()
		};
		const searchResult = { rows: [], stats };
		vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValueOnce(settings);
		vi.mocked(window.electron.getBlockLookupStats).mockResolvedValueOnce(stats);
		vi.mocked(window.electron.searchBlockLookup).mockResolvedValueOnce(searchResult);

		await expect(fetchBlockLookupBootstrap(queryClient)).resolves.toEqual([settings, stats]);
		await expect(fetchBlockLookupSearch(queryClient, { query: 'cab', limit: 50 })).resolves.toBe(searchResult);

		expect(queryClient.getQueryData(blockLookupBootstrapQueryOptions().queryKey)).toEqual([settings, stats]);
		expect(queryClient.getQueryData(blockLookupSearchQueryOptions({ query: 'cab', limit: 50 }).queryKey)).toBe(searchResult);
		expect(window.electron.searchBlockLookup).toHaveBeenCalledWith({ query: 'cab', limit: 50 });
	});

	it('runs Block Lookup index builds without owning session cache transitions', async () => {
		const queryClient = createTestQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
		const settings = { workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920', renderedPreviewsEnabled: false };
		const stats = {
			sources: 1,
			scanned: 1,
			skipped: 0,
			removed: 0,
			blocks: 2,
			updatedBlocks: 1,
			renderedPreviewsEnabled: false,
			renderedPreviews: 0,
			unavailablePreviews: 0,
			builtAt: new Date(0).toISOString()
		};
		const resultPayload = { settings, stats };
		vi.mocked(window.electron.buildBlockLookupIndex).mockResolvedValueOnce(resultPayload);

		const { result } = renderHook(() => useBuildBlockLookupIndexMutation(), { wrapper: createQueryWrapper(queryClient) });
		await act(async () => {
			await result.current.mutateAsync({ workshopRoot: settings.workshopRoot, forceRebuild: true });
		});

		expect(window.electron.buildBlockLookupIndex).toHaveBeenCalledWith({ workshopRoot: settings.workshopRoot, forceRebuild: true });
		expect(queryClient.getQueryData(blockLookupBootstrapQueryOptions().queryKey)).toBeUndefined();
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['blockLookup'] });
	});
});

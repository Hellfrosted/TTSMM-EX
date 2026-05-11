import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionMods, type AppConfig } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import type { ElectronApi } from '../../shared/electron-api';
import {
	applyCollectionLifecycleResultToCache,
	createModMetadataScanRequest,
	fetchBlockLookupBootstrap,
	fetchBlockLookupSearch,
	getBlockLookupBootstrapCacheData,
	readConfigCache,
	readCollectionCache,
	readCollectionsListCache,
	readGameRunningCache,
	readModMetadataCache,
	setConfigCacheData,
	setCollectionCacheData,
	setBlockLookupBootstrapCacheData,
	setBlockLookupSearchCacheData,
	setGameRunningCacheData,
	setModMetadataCacheData,
	useConfigCacheValue,
	useCollectionCacheValue,
	useCollectionsListCacheValue,
	useBuildBlockLookupIndexMutation,
	useUpdateCollectionMutation,
	useWriteConfigMutation
} from '../../renderer/async-cache';
import { persistConfigChange, writeConfig } from '../../renderer/util/config-write';

declare global {
	interface Window {
		electron: ElectronApi;
	}
}

describe('renderer async cache', () => {
	beforeEach(() => {
		setConfigCacheData(undefined);
		setCollectionCacheData({ collectionNames: undefined, collections: new Map() });
		setModMetadataCacheData(new Map());
		setGameRunningCacheData(undefined);
		setBlockLookupBootstrapCacheData(undefined);
		setBlockLookupSearchCacheData(new Map());
	});

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

	it('loads config through the Effect Atom cache and updates it after writes', async () => {
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
		setConfigCacheData(undefined);
		vi.mocked(window.electron.readConfig).mockResolvedValueOnce(storedConfig);

		await expect(readConfigCache()).resolves.toBe(storedConfig);
		expect(window.electron.readConfig).toHaveBeenCalledTimes(1);
		await expect(readConfigCache()).resolves.toBe(storedConfig);
		expect(window.electron.readConfig).toHaveBeenCalledTimes(1);

		const configValue = renderHook(() => useConfigCacheValue());
		expect(configValue.result.current).toBe(storedConfig);

		const { result } = renderHook(() => useWriteConfigMutation());
		await act(async () => {
			await result.current.mutateAsync(nextConfig);
		});

		expect(window.electron.updateConfig).toHaveBeenCalledWith(nextConfig);
		expect(configValue.result.current).toEqual(nextConfig);
	});

	it('writes config through the shared config persistence seam', async () => {
		const nextConfig: AppConfig = {
			...DEFAULT_CONFIG,
			currentPath: '/block-lookup',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		const commit = vi.fn();

		await writeConfig(nextConfig);
		expect(window.electron.updateConfig).toHaveBeenCalledWith(nextConfig);
		expect(renderHook(() => useConfigCacheValue()).result.current).toEqual(nextConfig);

		await expect(persistConfigChange(undefined, commit)).resolves.toBe(true);
		expect(commit).not.toHaveBeenCalled();

		await persistConfigChange(nextConfig, commit);
		expect(commit).toHaveBeenCalledWith(nextConfig);
	});

	it('updates collection detail cache entries after collection content writes', async () => {
		setCollectionCacheData({ collectionNames: undefined, collections: new Map() });
		const collection = { name: 'fresh', mods: ['local:mod-a'] };

		const { result } = renderHook(() => useUpdateCollectionMutation());
		await act(async () => {
			await result.current.mutateAsync(collection);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ collectionName: 'fresh', mods: ['local:mod-a'] });
		expect(renderHook(() => useCollectionCacheValue('fresh')).result.current).toEqual(collection);
	});

	it('loads collection list and details through the Effect Atom cache', async () => {
		const storedCollection = { name: 'default', mods: ['local:mod-a'] };
		setCollectionCacheData({ collectionNames: undefined, collections: new Map() });
		vi.mocked(window.electron.readCollectionsList).mockResolvedValueOnce(['default']);
		vi.mocked(window.electron.readCollection).mockResolvedValueOnce(storedCollection);

		await expect(readCollectionsListCache()).resolves.toEqual(['default']);
		await expect(readCollectionsListCache()).resolves.toEqual(['default']);
		expect(window.electron.readCollectionsList).toHaveBeenCalledTimes(1);
		expect(renderHook(() => useCollectionsListCacheValue()).result.current).toEqual(['default']);

		await expect(readCollectionCache('default')).resolves.toBe(storedCollection);
		await expect(readCollectionCache('default')).resolves.toBe(storedCollection);
		expect(window.electron.readCollection).toHaveBeenCalledTimes(1);
		expect(renderHook(() => useCollectionCacheValue('default')).result.current).toBe(storedCollection);
	});

	it('loads mod metadata through the Effect Atom cache and preserves force reload behavior', async () => {
		const userOverrides = new Map([['local:fresh', { tags: ['alpha'] }]]);
		const scanRequest = createModMetadataScanRequest({
			allCollections: new Map([['default', { name: 'default', mods: ['local:fresh'] }]]),
			workshopID: DEFAULT_CONFIG.workshopID,
			forceReload: false,
			userOverrides
		});
		const refreshedMods = new SessionMods('', [{ uid: 'local:fresh', id: 'Fresh', name: 'Fresh', type: 'local' }]);
		vi.mocked(window.electron.readModMetadata).mockResolvedValue(refreshedMods);

		await expect(
			readModMetadataCache({
				localDir: 'C:\\mods',
				scanRequest,
				forceReload: false,
				attempt: 0,
				userOverrides,
				treatNuterraSteamBetaAsEquivalent: false
			})
		).resolves.toBeInstanceOf(SessionMods);
		await readModMetadataCache({
			localDir: 'C:\\mods',
			scanRequest,
			forceReload: false,
			attempt: 0,
			userOverrides,
			treatNuterraSteamBetaAsEquivalent: false
		});
		expect(window.electron.readModMetadata).toHaveBeenCalledTimes(1);
		expect(window.electron.readModMetadata).toHaveBeenCalledWith('C:\\mods', scanRequest.knownModIds, {
			treatNuterraSteamBetaAsEquivalent: false
		});

		await readModMetadataCache({
			localDir: 'C:\\mods',
			scanRequest,
			forceReload: true,
			attempt: 0,
			userOverrides,
			treatNuterraSteamBetaAsEquivalent: false
		});
		expect(window.electron.readModMetadata).toHaveBeenCalledTimes(2);
	});

	it('loads game-running status through the Effect Atom cache', async () => {
		vi.mocked(window.electron.isGameRunning).mockResolvedValueOnce(true);

		await expect(readGameRunningCache()).resolves.toBe(true);
		await expect(readGameRunningCache()).resolves.toBe(true);

		expect(window.electron.isGameRunning).toHaveBeenCalledTimes(1);
	});

	it('applies successful Collection Lifecycle Command results to renderer cache projections', () => {
		const defaultCollection = { name: 'default', mods: ['local:old'] };
		const renamedCollection = { name: 'renamed', mods: ['local:new'] };
		const nextConfig: AppConfig = {
			...DEFAULT_CONFIG,
			activeCollection: 'renamed',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		setCollectionCacheData({ collectionNames: ['default'], collections: new Map([['default', defaultCollection]]) });

		applyCollectionLifecycleResultToCache({
			ok: true,
			activeCollection: renamedCollection,
			collections: [renamedCollection],
			collectionNames: ['renamed'],
			config: nextConfig
		});

		expect(renderHook(() => useConfigCacheValue()).result.current).toEqual(nextConfig);
		expect(renderHook(() => useCollectionsListCacheValue()).result.current).toEqual(['renamed']);
		expect(renderHook(() => useCollectionCacheValue('renamed')).result.current).toBe(renamedCollection);
		expect(renderHook(() => useCollectionCacheValue('default')).result.current).toBeUndefined();
	});

	it('loads Block Lookup bootstrap and search through named cache helpers', async () => {
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

		await expect(fetchBlockLookupBootstrap()).resolves.toEqual([settings, stats]);
		await expect(fetchBlockLookupBootstrap()).resolves.toEqual([settings, stats]);
		await expect(fetchBlockLookupSearch({ query: 'cab', limit: 50 })).resolves.toBe(searchResult);
		await expect(fetchBlockLookupSearch({ query: 'cab', limit: 50 })).resolves.toBe(searchResult);

		expect(getBlockLookupBootstrapCacheData()).toEqual([settings, stats]);
		expect(window.electron.readBlockLookupSettings).toHaveBeenCalledTimes(1);
		expect(window.electron.getBlockLookupStats).toHaveBeenCalledTimes(1);
		expect(window.electron.searchBlockLookup).toHaveBeenCalledTimes(1);
		expect(window.electron.searchBlockLookup).toHaveBeenCalledWith({ query: 'cab', limit: 50 });
	});

	it('runs Block Lookup index builds without owning session cache transitions', async () => {
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

		const { result } = renderHook(() => useBuildBlockLookupIndexMutation());
		await act(async () => {
			await result.current.mutateAsync({ workshopRoot: settings.workshopRoot, forceRebuild: true });
		});

		expect(window.electron.buildBlockLookupIndex).toHaveBeenCalledWith({ workshopRoot: settings.workshopRoot, forceRebuild: true });
		expect(getBlockLookupBootstrapCacheData()).toBeUndefined();
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createContextMenuTemplate,
	createDownloadModHandler,
	createFetchWorkshopDependenciesHandler,
	createReadModMetadataHandler,
	createSteamworksInitHandler,
	createSubscribeModHandler
} from '../../main/ipc/mod-handlers';
import Steamworks, { EResult, UGCItemState } from '../../main/steamworks';
import ModFetcher, { getModDetailsFromPath } from '../../main/mod-fetcher';
import { SteamworksRuntime } from '../../main/steamworks-runtime';
import { ModType } from '../../model';
import { ValidChannel } from '../../shared/ipc';

vi.mock('../../main/mod-fetcher', async () => {
	const actual = await vi.importActual<typeof import('../../main/mod-fetcher')>('../../main/mod-fetcher');
	return {
		...actual,
		getModDetailsFromPath: vi.fn(async (potentialMod) => {
			if (!potentialMod.name) {
				potentialMod.name = 'BundleId';
			}
			potentialMod.id = 'BundleId';
			return potentialMod;
		})
	};
});

describe('mod handlers', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('downloads mods through ugcDownloadItem', async () => {
		const steamworks = {
			ugcDownloadItem: vi.fn((workshopID: bigint, success: (result: EResult) => void) => {
				expect(workshopID).toBe(BigInt(42));
				success(EResult.k_EResultOK);
			}),
			ugcUnsubscribe: vi.fn()
		};

		const result = await createDownloadModHandler(steamworks as never)({} as never, BigInt(42));

		expect(result).toBe(true);
		expect(steamworks.ugcDownloadItem).toHaveBeenCalledTimes(1);
		expect(steamworks.ugcUnsubscribe).not.toHaveBeenCalled();
	});

	it('rejects malformed download payloads before calling Steamworks', async () => {
		const steamworks = {
			ugcDownloadItem: vi.fn()
		};

		await expect(createDownloadModHandler(steamworks as never)({} as never, '42' as never)).rejects.toThrow(
			`Invalid IPC payload for ${ValidChannel.DOWNLOAD_MOD}`
		);

		expect(steamworks.ugcDownloadItem).not.toHaveBeenCalled();
	});

	it('returns false when a Steam action throws synchronously', async () => {
		const steamworks = {
			ugcSubscribe: vi.fn(() => {
				throw new Error('native module unavailable');
			})
		};

		const result = await createSubscribeModHandler(steamworks as never)({} as never, BigInt(42));

		expect(result).toBe(false);
		expect(steamworks.ugcSubscribe).toHaveBeenCalledTimes(1);
	});

	it('publishes workshop dependency lookups as metadata updates', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};
		const dependencyLookup = vi.fn(async () => ({
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			}
		}));

		const result = await createFetchWorkshopDependenciesHandler(mainWindowProvider as never, dependencyLookup)({} as never, BigInt(10));

		expect(result).toBe(true);
		expect(dependencyLookup).toHaveBeenCalledWith(BigInt(10));
		expect(send).toHaveBeenCalledWith(ValidChannel.MOD_METADATA_UPDATE, 'workshop:10', {
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			}
		});
	});

	it('rejects malformed workshop dependency payloads before lookup', async () => {
		const mainWindowProvider = {
			getWebContents: vi.fn()
		};
		const dependencyLookup = vi.fn();

		await expect(
			createFetchWorkshopDependenciesHandler(mainWindowProvider as never, dependencyLookup)({} as never, BigInt(0))
		).rejects.toThrow(`Invalid IPC payload for ${ValidChannel.FETCH_WORKSHOP_DEPENDENCIES}`);

		expect(dependencyLookup).not.toHaveBeenCalled();
		expect(mainWindowProvider.getWebContents).not.toHaveBeenCalled();
	});

	it('rejects mod metadata requests when scanning mods fails', async () => {
		vi.spyOn(ModFetcher.prototype, 'fetchMods').mockRejectedValueOnce(new Error('scan failed'));

		await expect(createReadModMetadataHandler()({ sender: {} as never }, 'C:\\mods', [])).rejects.toThrow('scan failed');
	});

	it('rejects malformed mod metadata payloads before clearing caches', async () => {
		const clearDependencyLookupCache = vi.fn();

		await expect(
			createReadModMetadataHandler(clearDependencyLookupCache)(
				{ sender: {} as never },
				'C:\\mods',
				'workshop:42' as never
			)
		).rejects.toThrow(`Invalid IPC payload for ${ValidChannel.READ_MOD_METADATA}`);

		expect(clearDependencyLookupCache).not.toHaveBeenCalled();
	});

	it('clears cached workshop dependency lookups before rescanning mod metadata', async () => {
		const clearDependencyLookupCache = vi.fn();
		vi.spyOn(ModFetcher.prototype, 'fetchMods').mockResolvedValueOnce([]);

		await createReadModMetadataHandler(clearDependencyLookupCache)({ sender: {} as never }, 'C:\\mods', []);

		expect(clearDependencyLookupCache).toHaveBeenCalledTimes(1);
	});

	it('returns ready without initializing Steamworks when the development bypass is enabled', async () => {
		const init = vi.fn(() => {
			throw new Error('greenworks unavailable');
		});
		const logger = {
			error: vi.fn(),
			warn: vi.fn()
		};
		const runtime = new SteamworksRuntime({
			env: { TTSMM_BYPASS_STEAMWORKS: '1' },
			steamworks: { init } as never,
			logger: logger as never
		});

		const result = await createSteamworksInitHandler(
			() => runtime.getStatus(),
			() => runtime.tryInit()
		)();

		expect(result).toEqual({ inited: true });
		expect(init).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('preserves Steam metadata when refreshing workshop state from the context menu', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};

		vi.spyOn(Steamworks, 'ugcDownloadItem').mockImplementation((_workshopID, success) => {
			success();
		});
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed | UGCItemState.Installed);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue({
			folder: 'C:\\mods\\42',
			sizeOnDisk: '2048',
			timestamp: 1710000000
		});

		const template = createContextMenuTemplate(
			{
				uid: 'workshop:42',
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'HumanReadableModId',
				name: 'Steam Title',
				description: 'Workshop description',
				tags: ['Mods', 'Blocks'],
				authors: ['Author'],
				subscribed: true,
				installed: true,
				needsUpdate: true
			},
			mainWindowProvider as never
		);

		const updateAction = template.find((item) => item.label === 'Update');
		expect(updateAction?.click).toBeTypeOf('function');

		updateAction?.click?.();
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(vi.mocked(getModDetailsFromPath)).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Steam Title',
				description: 'Workshop description',
				tags: ['Mods', 'Blocks'],
				authors: ['Author'],
				subscribed: true
			}),
			'C:\\mods\\42',
			ModType.WORKSHOP
		);
		expect(send).toHaveBeenLastCalledWith(
			ValidChannel.MOD_METADATA_UPDATE,
			'workshop:42',
			expect.objectContaining({
				name: 'Steam Title',
				id: 'BundleId',
				subscribed: true,
				installed: true,
				path: 'C:\\mods\\42'
			})
		);
	});

	it('publishes the best available workshop metadata when refresh parsing fails', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};

		vi.mocked(getModDetailsFromPath).mockRejectedValueOnce(new Error('bad metadata'));
		vi.spyOn(Steamworks, 'ugcDownloadItem').mockImplementation((_workshopID, success) => {
			success();
		});
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed | UGCItemState.Installed);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue({
			folder: 'C:\\mods\\42',
			sizeOnDisk: '2048',
			timestamp: 1710000000
		});

		const template = createContextMenuTemplate(
			{
				uid: 'workshop:42',
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'HumanReadableModId',
				name: 'Steam Title',
				description: 'Workshop description',
				tags: ['Mods', 'Blocks'],
				authors: ['Author'],
				subscribed: true,
				installed: true,
				needsUpdate: true
			},
			mainWindowProvider as never
		);

		const updateAction = template.find((item) => item.label === 'Update');
		updateAction?.click?.();
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(send).toHaveBeenLastCalledWith(
			ValidChannel.MOD_METADATA_UPDATE,
			'workshop:42',
			expect.objectContaining({
				name: 'Steam Title',
				description: 'Workshop description',
				tags: ['Mods', 'Blocks'],
				authors: ['Author'],
				subscribed: true,
				installed: true,
				path: 'C:\\mods\\42'
			})
		);
	});
});

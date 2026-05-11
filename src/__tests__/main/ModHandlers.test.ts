import { Effect } from 'effect';
import type { MenuItemConstructorOptions } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createContextMenuTemplate,
	createDownloadModHandler,
	createFetchWorkshopDependenciesHandler,
	createReadModMetadataHandler,
	createSubscribeModHandler,
	registerModHandlers
} from '../../main/ipc/mod-handlers';
import { getModDetailsFromPath } from '../../main/mod-fetcher';
import Steamworks from '../../main/steamworks';
import { EResult, UGCItemState } from '../../main/steamworks/types';
import { ModType } from '../../model';
import { ValidChannel } from '../../shared/ipc';

vi.mock('../../main/mod-fetcher', async () => {
	const actual = await vi.importActual<typeof import('../../main/mod-fetcher')>('../../main/mod-fetcher');
	return {
		...actual,
		getModDetailsFromPath: vi.fn((potentialMod) => {
			if (!potentialMod.name) {
				potentialMod.name = 'BundleId';
			}
			potentialMod.id = 'BundleId';
			return Effect.succeed(potentialMod);
		})
	};
});

function getSubmenuItems(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
	if (!item || !Array.isArray(item.submenu)) {
		throw new Error('Expected menu item to have a submenu');
	}
	return item.submenu;
}

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

	it('rejects registered Steam actions from unexpected IPC senders before native calls', async () => {
		const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
		const ipcMain = {
			handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
				handlers.set(channel, handler);
			}),
			on: vi.fn()
		};
		const readyStatus = { inited: true, readiness: { kind: 'ready', retryable: false } } as const;
		const tryInitSteamworks = vi.fn(() => readyStatus);

		registerModHandlers(
			ipcMain as never,
			{
				getWebContents: () => null
			},
			() => readyStatus,
			tryInitSteamworks
		);

		const handler = handlers.get(ValidChannel.DOWNLOAD_MOD);
		if (!handler) {
			throw new Error(`Missing handler for ${ValidChannel.DOWNLOAD_MOD}`);
		}

		await expect(
			handler(
				{
					senderFrame: {
						url: 'https://example.com/index.html'
					}
				},
				BigInt(42)
			)
		).rejects.toThrow('Rejected IPC sender for download-mod');
		expect(tryInitSteamworks).not.toHaveBeenCalled();
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
		const dependencyLookup = vi.fn(() =>
			Effect.succeed({
				status: 'updated' as const,
				snapshot: {
					steamDependencies: [BigInt(11)],
					steamDependencyNames: {
						'11': 'Harmony (2.2.2)'
					},
					steamDependenciesFetchedAt: 1777777777777
				}
			})
		);

		const result = await createFetchWorkshopDependenciesHandler(mainWindowProvider as never, dependencyLookup)({} as never, BigInt(10));

		expect(result).toEqual({ status: 'updated' });
		expect(dependencyLookup).toHaveBeenCalledWith(BigInt(10));
		expect(send).toHaveBeenCalledWith(ValidChannel.MOD_METADATA_UPDATE, 'workshop:10', {
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			},
			steamDependenciesFetchedAt: 1777777777777
		});
	});

	it('publishes unknown workshop dependency lookups as timestamp-only metadata updates', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};
		const dependencyLookup = vi.fn(() => Effect.succeed({ status: 'unknown' as const, checkedAt: 1777777777777 }));

		const result = await createFetchWorkshopDependenciesHandler(mainWindowProvider as never, dependencyLookup)({} as never, BigInt(10));

		expect(result).toEqual({ status: 'unknown' });
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0]).toEqual([ValidChannel.MOD_METADATA_UPDATE, 'workshop:10', expect.any(Object)]);
		expect(send.mock.calls[0]?.[2]).toStrictEqual({
			steamDependencies: undefined,
			steamDependencyNames: undefined,
			steamDependenciesFetchedAt: 1777777777777
		});
	});

	it('does not publish metadata updates when workshop dependency lookups fail', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};
		const dependencyLookup = vi.fn(() => Effect.succeed({ status: 'failed' as const }));

		const result = await createFetchWorkshopDependenciesHandler(mainWindowProvider as never, dependencyLookup)({} as never, BigInt(10));

		expect(result).toEqual({ status: 'failed' });
		expect(send).not.toHaveBeenCalled();
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

	it('nests workshop subscription actions under the Steam Subscription submenu', () => {
		const mainWindowProvider = {
			getWebContents: () => null
		};

		const subscribedTemplate = createContextMenuTemplate(
			{
				uid: 'workshop:42',
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'HumanReadableModId',
				name: 'Steam Title',
				subscribed: true
			},
			mainWindowProvider
		);
		const unsubscribedTemplate = createContextMenuTemplate(
			{
				uid: 'workshop:43',
				type: ModType.WORKSHOP,
				workshopID: BigInt(43),
				id: 'OtherModId',
				name: 'Other Steam Title',
				subscribed: false
			},
			mainWindowProvider
		);

		expect(subscribedTemplate.find((item) => item.label === 'Unsubscribe')).toBeUndefined();
		expect(unsubscribedTemplate.find((item) => item.label === 'Subscribe')).toBeUndefined();

		const subscribedItems = getSubmenuItems(subscribedTemplate.find((item) => item.label === 'Steam Subscription'));
		const unsubscribedItems = getSubmenuItems(unsubscribedTemplate.find((item) => item.label === 'Steam Subscription'));

		expect(subscribedItems.map((item) => item.label)).toEqual(['Unsubscribe']);
		expect(unsubscribedItems.map((item) => item.label)).toEqual(['Subscribe']);
	});

	it('unsubscribes from the nested Steam Subscription action', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};
		vi.spyOn(Steamworks, 'ugcUnsubscribe').mockImplementation((_workshopID, success) => {
			success(EResult.k_EResultOK);
			return true;
		});
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(0);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);

		const template = createContextMenuTemplate(
			{
				uid: 'workshop:42',
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'HumanReadableModId',
				name: 'Steam Title',
				subscribed: true
			},
			mainWindowProvider as never
		);

		const subscriptionItems = getSubmenuItems(template.find((item) => item.label === 'Steam Subscription'));
		const unsubscribeAction = subscriptionItems.find((item) => item.label === 'Unsubscribe');
		expect(unsubscribeAction?.click).toBeTypeOf('function');

		unsubscribeAction?.click?.({} as never, {} as never, {} as never);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(Steamworks.ugcUnsubscribe).toHaveBeenCalledWith(BigInt(42), expect.any(Function), expect.any(Function));
		expect(send).toHaveBeenCalledWith(ValidChannel.MOD_METADATA_UPDATE, 'workshop:42', { subscribed: false });
	});

	it('rejects mod metadata requests when scanning mods fails', async () => {
		const scanInventory = vi.fn(() => Effect.fail(new Error('scan failed')));

		await expect(createReadModMetadataHandler(scanInventory)({ sender: {} as never }, 'C:\\mods', [])).rejects.toThrow('scan failed');
	});

	it('rejects malformed mod metadata payloads before scanning inventory', async () => {
		const scanInventory = vi.fn();

		await expect(createReadModMetadataHandler(scanInventory)({ sender: {} as never }, 'C:\\mods', 'workshop:42' as never)).rejects.toThrow(
			`Invalid IPC payload for ${ValidChannel.READ_MOD_METADATA}`
		);

		expect(scanInventory).not.toHaveBeenCalled();
	});

	it('scans mod metadata after validating metadata requests', async () => {
		const scanInventory = vi.fn(() => Effect.succeed([]));

		await createReadModMetadataHandler(scanInventory)({ sender: {} as never }, 'C:\\mods', []);

		expect(scanInventory).toHaveBeenCalledTimes(1);
	});

	it('preserves Steam metadata when refreshing workshop state from the context menu', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};

		vi.spyOn(Steamworks, 'ugcDownloadItem').mockImplementation((_workshopID, success) => {
			success(EResult.k_EResultOK);
			return true;
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

		updateAction?.click?.({} as never, {} as never, {} as never);
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

		vi.mocked(getModDetailsFromPath).mockReturnValueOnce(Effect.fail(new Error('bad metadata')));
		vi.spyOn(Steamworks, 'ugcDownloadItem').mockImplementation((_workshopID, success) => {
			success(EResult.k_EResultOK);
			return true;
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
		updateAction?.click?.({} as never, {} as never, {} as never);
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

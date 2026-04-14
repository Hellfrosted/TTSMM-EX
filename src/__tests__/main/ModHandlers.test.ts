import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContextMenuTemplate, createDownloadModHandler, createFetchWorkshopDependenciesHandler } from '../../main/ipc/mod-handlers';
import Steamworks, { EResult, UGCItemState } from '../../main/steamworks';
import { getModDetailsFromPath } from '../../main/mod-fetcher';
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
});

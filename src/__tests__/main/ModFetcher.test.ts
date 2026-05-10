import { describe, expect, it, vi } from 'vitest';
import Steamworks from '../../main/steamworks';
import ModFetcher from '../../main/mod-fetcher';

describe('ModFetcher', () => {
	it('skips Linux workshop scans when TerraTech is not installed in Steam', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(false);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([BigInt(1)]);
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('workshop scan should have been skipped');
		});
		const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [], 'linux');

		await expect(fetcher.fetchWorkshopMods()).resolves.toEqual([]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).not.toHaveBeenCalled();
		expect(ugcGetUserItems).not.toHaveBeenCalled();
	});

	it('uses subscribed items instead of user item queries for Linux workshop scans', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
		const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation(() => {
			throw new Error('linux workshop scans should not query workshop details');
		});
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('linux workshop scans should not query user items');
		});
		const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [], 'linux');

		await expect(fetcher.fetchWorkshopMods()).resolves.toEqual([]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).toHaveBeenCalledTimes(1);
		expect(getUGCDetails).not.toHaveBeenCalled();
		expect(ugcGetUserItems).not.toHaveBeenCalled();
	});
});

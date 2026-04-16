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

	it('uses subscribed items instead of user item queries for empty Linux workshop scans', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
		const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation(() => {
			throw new Error('linux workshop scans should not query workshop details when there are no subscribed items');
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

	it('hydrates Linux workshop mods from subscribed item details', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([BigInt(42)]);
		const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((workshopIDs, successCallback) => {
			expect(workshopIDs).toEqual(['42']);
			successCallback([
				{
					acceptForUse: true,
					banned: false,
					tagsTruncated: false,
					fileType: 0,
					result: 1,
					visibility: 0,
					score: 0,
					file: '',
					fileName: '',
					fileSize: 1234,
					previewURL: 'https://example.com/preview.png',
					previewFile: '',
					previewFileSize: 0,
					steamIDOwner: '123',
					consumerAppID: 285920,
					creatorAppID: 285920,
					publishedFileId: BigInt(42),
					title: 'Workshop Title',
					description: 'Workshop Description',
					URL: '',
					timeAddedToUserList: 1,
					timeCreated: 2,
					timeUpdated: 3,
					votesDown: 0,
					votesUp: 0,
					children: [],
					metadata: '',
					tags: ['Mods'],
					tagsDisplayNames: ['Mods']
				}
			]);
		});
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('linux workshop scans should not query user items');
		});
		const ugcGetItemState = vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(0);
		const ugcGetItemInstallInfo = vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
		const on = vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
		const getFriendPersonaName = vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Author One');
		const requestUserInformation = vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);
		const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [], 'linux');

		await expect(fetcher.fetchWorkshopMods()).resolves.toMatchObject([
			{
				workshopID: BigInt(42),
				name: 'Workshop Title',
				description: 'Workshop Description',
				authors: ['Author One'],
				tags: ['Mods']
			}
		]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).toHaveBeenCalledTimes(1);
		expect(getUGCDetails).toHaveBeenCalledTimes(1);
		expect(ugcGetUserItems).not.toHaveBeenCalled();
		expect(ugcGetItemState).toHaveBeenCalledWith(BigInt(42));
		expect(ugcGetItemInstallInfo).toHaveBeenCalledWith(BigInt(42));
		expect(on).toHaveBeenCalledTimes(1);
		expect(getFriendPersonaName).toHaveBeenCalledWith('123');
		expect(requestUserInformation).not.toHaveBeenCalled();
	});
});

import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Steamworks, { type SteamUGCDetails, UGCItemState, UGCItemVisibility } from '../../main/steamworks';
import ModFetcher from '../../main/mod-fetcher';
import { createTempDir } from './test-utils';

function createWorkshopDetails(overrides: Partial<SteamUGCDetails> & Pick<SteamUGCDetails, 'publishedFileId' | 'title'>): SteamUGCDetails {
	return {
		acceptForUse: true,
		banned: false,
		tagsTruncated: false,
		fileType: 0,
		result: 1,
		visibility: UGCItemVisibility.Public,
		score: 1,
		file: '',
		fileName: '',
		fileSize: 1024,
		previewURL: '',
		previewFile: '',
		previewFileSize: 0,
		steamIDOwner: 'owner-1',
		consumerAppID: 285920,
		creatorAppID: 285920,
		description: '',
		URL: '',
		timeAddedToUserList: 0,
		timeCreated: 0,
		timeUpdated: 0,
		votesDown: 0,
		votesUp: 0,
		children: [],
		metadata: '',
		tags: [],
		tagsDisplayNames: [],
		...overrides
	};
}

describe('ModFetcher', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('loads local mods without querying Steam Workshop when Steamworks is bypassed', async () => {
		const tempDir = createTempDir('ttsmm-local-only-');
		const modDir = path.join(tempDir, 'LocalPack');
		try {
			fs.mkdirSync(modDir, { recursive: true });
			fs.writeFileSync(path.join(modDir, 'LocalBundle_bundle'), 'bundle');

			const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockImplementation(() => {
				throw new Error('Steam install check should have been skipped');
			});
			const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockImplementation(() => {
				throw new Error('Steam install dir check should have been skipped');
			});
			const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockImplementation(() => {
				throw new Error('workshop scan should have been skipped');
			});
			const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation(() => {
				throw new Error('workshop details should have been skipped');
			});
			const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
				throw new Error('workshop user items should have been skipped');
			});
			const ugcGetItemState = vi.spyOn(Steamworks, 'ugcGetItemState').mockImplementation(() => {
				throw new Error('workshop item state should have been skipped');
			});
			const ugcGetItemInstallInfo = vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockImplementation(() => {
				throw new Error('workshop install info should have been skipped');
			});
			const sender = { send: vi.fn() };
			const fetcher = new ModFetcher(sender, tempDir, [BigInt(42)], 'linux', { skipWorkshopSteamworks: true });

			await expect(fetcher.fetchMods()).resolves.toEqual([
				expect.objectContaining({
					uid: 'local:LocalBundle',
					id: 'LocalBundle',
					name: 'LocalBundle',
					path: modDir
				})
			]);

			expect(getSubscribedItems).not.toHaveBeenCalled();
			expect(getUGCDetails).not.toHaveBeenCalled();
			expect(ugcGetUserItems).not.toHaveBeenCalled();
			expect(isAppInstalled).not.toHaveBeenCalled();
			expect(getAppInstallDir).not.toHaveBeenCalled();
			expect(ugcGetItemState).not.toHaveBeenCalled();
			expect(ugcGetItemInstallInfo).not.toHaveBeenCalled();
			expect(sender.send).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 1, 'Finished loading mods');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

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

	it('filters non-mod subscribed workshop items on Linux while enriching valid mods from Steam metadata', async () => {
		const tempDir = createTempDir('ttsmm-linux-workshop-');
		const validWorkshopID = BigInt(123);
		const invalidWorkshopID = BigInt(456);
		const validModDir = path.join(tempDir, validWorkshopID.toString());
		try {
			fs.mkdirSync(validModDir, { recursive: true });
			fs.writeFileSync(path.join(validModDir, 'GreenTech_bundle'), 'bundle');

			vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
			vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
			const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([validWorkshopID, invalidWorkshopID]);
			const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((ids, successCallback) => {
				expect(ids).toEqual([validWorkshopID.toString(), invalidWorkshopID.toString()]);
				successCallback([
					createWorkshopDetails({
						publishedFileId: validWorkshopID,
						title: 'Green Tech Expansion',
						description: 'A valid TerraTech mod',
						tags: ['Mods', 'Blocks'],
						tagsDisplayNames: ['Mods', 'Blocks'],
						children: [BigInt(789)],
						previewURL: 'preview://valid'
					}),
					createWorkshopDetails({
						publishedFileId: invalidWorkshopID,
						title: 'Tech Snapshot',
						description: 'Not a mod',
						tags: ['Screenshots'],
						tagsDisplayNames: ['Screenshots']
					})
				]);
			});
			const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
				throw new Error('linux workshop scans should not query user items');
			});
			vi.spyOn(Steamworks, 'ugcGetItemState').mockImplementation((workshopID) => {
				if (workshopID === validWorkshopID) {
					return UGCItemState.Subscribed | UGCItemState.Installed;
				}
				if (workshopID === invalidWorkshopID) {
					return UGCItemState.Subscribed;
				}
				return UGCItemState.None;
			});
			vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockImplementation((workshopID) => {
				if (workshopID === validWorkshopID) {
					return {
						folder: validModDir,
						sizeOnDisk: '2048',
						timestamp: 1710000000
					};
				}
				return undefined;
			});
			vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
			vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Test Author');
			vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);

			const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [], 'linux');

			await expect(fetcher.fetchWorkshopMods()).resolves.toEqual([
				expect.objectContaining({
					uid: `workshop:${validWorkshopID}`,
					workshopID: validWorkshopID,
					name: 'Green Tech Expansion',
					id: 'GreenTech',
					tags: ['Mods', 'Blocks'],
					steamDependencies: [BigInt(789)],
					steamDependenciesFetchedAt: expect.any(Number),
					authors: ['Test Author']
				})
			]);

			expect(getSubscribedItems).toHaveBeenCalledTimes(1);
			expect(getUGCDetails).toHaveBeenCalledTimes(1);
			expect(ugcGetUserItems).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps explicitly referenced Linux workshop ids visible when Steam metadata is unavailable', async () => {
		const explicitWorkshopID = BigInt(789);

		vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
		vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((_ids, _successCallback, errorCallback) => {
			errorCallback?.(new Error('metadata unavailable'));
		});
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.None);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);

		const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [explicitWorkshopID], 'linux');

		await expect(fetcher.fetchWorkshopMods()).resolves.toEqual([
			expect.objectContaining({
				uid: `workshop:${explicitWorkshopID}`,
				workshopID: explicitWorkshopID,
				name: `Workshop item ${explicitWorkshopID.toString()}`,
				id: null
			})
		]);
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
		vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
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
		expect(getFriendPersonaName).toHaveBeenCalledWith('123');
		expect(requestUserInformation).not.toHaveBeenCalled();
	});

	it('only applies safe ttsmm metadata fields without overriding workshop identity or Steam metadata', async () => {
		const tempDir = createTempDir('ttsmm-sanitized-workshop-');
		const workshopID = BigInt(321);
		const workshopDir = path.join(tempDir, workshopID.toString());
		try {
			fs.mkdirSync(workshopDir, { recursive: true });
			fs.writeFileSync(path.join(workshopDir, 'CoreBundle_bundle'), 'bundle');
			fs.writeFileSync(
				path.join(workshopDir, 'ttsmm.json'),
				JSON.stringify({
					uid: 'local:overridden',
					type: 'local',
					workshopID: '999999',
					path: 'C:\\malicious',
					subscribed: false,
					name: 'Local Override Name',
					description: 'Local description',
					authors: ['Local Author'],
					tags: ['LocalTag'],
					explicitIDDependencies: ['MissingDependency']
				})
			);

			vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed | UGCItemState.Installed);
			vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue({
				folder: workshopDir,
				sizeOnDisk: '2048',
				timestamp: 1710000000
			});
			vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
			vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Steam Author');
			vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);

			const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [], 'win32');
			const mod = await fetcher.buildWorkshopMod(
				workshopID,
				createWorkshopDetails({
					publishedFileId: workshopID,
					title: 'Steam Workshop Title',
					description: 'Steam description',
					tags: ['Mods', 'Blocks'],
					tagsDisplayNames: ['Mods', 'Blocks']
				})
			);

			expect(mod).toEqual(
				expect.objectContaining({
					uid: `workshop:${workshopID}`,
					type: 'workshop',
					workshopID,
					path: workshopDir,
					subscribed: true,
					name: 'Steam Workshop Title',
					description: 'Steam description',
					authors: ['Steam Author'],
					tags: ['Mods', 'Blocks'],
					explicitIDDependencies: ['MissingDependency'],
					id: 'CoreBundle'
				})
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

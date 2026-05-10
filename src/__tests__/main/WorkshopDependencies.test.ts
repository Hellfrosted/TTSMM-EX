import { describe, expect, it, vi } from 'vitest';
import {
	createWorkshopDependencySnapshot,
	fetchWorkshopDependencySnapshot,
	resolveWorkshopDependencyNames
} from '../../main/workshop-dependencies';
import { EResult, UGCItemVisibility, type SteamUGCDetails } from '../../main/steamworks/types';

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
		metadata: '',
		tags: [],
		tagsDisplayNames: [],
		children: [],
		...overrides
	};
}

describe('workshop dependency snapshots', () => {
	it('creates a known dependency snapshot from Steamworks children', () => {
		const dependencyNames = new Map([[BigInt(11), 'Harmony (2.2.2)']]);

		expect(
			createWorkshopDependencySnapshot(
				createWorkshopDetails({
					publishedFileId: BigInt(77),
					title: 'Parent',
					children: [BigInt(11), BigInt(22)]
				}),
				dependencyNames,
				new Date('2026-05-03T12:00:00Z').getTime()
			)
		).toEqual({
			steamDependencies: [BigInt(11), BigInt(22)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			},
			steamDependenciesFetchedAt: new Date('2026-05-03T12:00:00Z').getTime()
		});
	});

	it('keeps missing Steamworks children as an unknown dependency snapshot', () => {
		expect(
			createWorkshopDependencySnapshot(
				createWorkshopDetails({
					publishedFileId: BigInt(77),
					title: 'Parent',
					children: undefined
				})
			)
		).toBeNull();
	});

	it('does not create dependency snapshots from failed Steamworks details', () => {
		expect(
			createWorkshopDependencySnapshot(
				createWorkshopDetails({
					publishedFileId: BigInt(77),
					title: 'Parent',
					children: [BigInt(11)],
					result: EResult.k_EResultFail
				})
			)
		).toBeNull();
	});

	it('resolves dependency names from Steamworks child details', async () => {
		const getDetails = vi.fn(async (workshopIDs: bigint[]) => {
			expect(workshopIDs).toEqual([BigInt(11), BigInt(22)]);
			return [
				createWorkshopDetails({ publishedFileId: BigInt(11), title: 'Harmony (2.2.2)' }),
				createWorkshopDetails({ publishedFileId: BigInt(22), title: 'NuterraSteam' })
			];
		});

		await expect(
			resolveWorkshopDependencyNames(
				[
					createWorkshopDetails({
						publishedFileId: BigInt(77),
						title: 'Parent',
						children: [BigInt(11), BigInt(22), BigInt(11)]
					})
				],
				getDetails
			)
		).resolves.toEqual(
			new Map([
				[BigInt(11), 'Harmony (2.2.2)'],
				[BigInt(22), 'NuterraSteam']
			])
		);
	});

	it('ignores failed dependency details when resolving dependency names', async () => {
		const getDetails = vi.fn(async () => [
			createWorkshopDetails({ publishedFileId: BigInt(11), title: 'Unavailable Dependency', result: EResult.k_EResultFail }),
			createWorkshopDetails({ publishedFileId: BigInt(22), title: 'NuterraSteam' })
		]);

		await expect(
			resolveWorkshopDependencyNames(
				[
					createWorkshopDetails({
						publishedFileId: BigInt(77),
						title: 'Parent',
						children: [BigInt(11), BigInt(22)]
					})
				],
				getDetails
			)
		).resolves.toEqual(new Map([[BigInt(22), 'NuterraSteam']]));
	});

	it('fetches explicit dependency snapshots through Steamworks details only', async () => {
		const getDetails = vi
			.fn()
			.mockResolvedValueOnce([
				createWorkshopDetails({
					publishedFileId: BigInt(77),
					title: 'Parent',
					children: [BigInt(11)]
				})
			])
			.mockResolvedValueOnce([createWorkshopDetails({ publishedFileId: BigInt(11), title: 'Harmony (2.2.2)' })]);

		await expect(fetchWorkshopDependencySnapshot(BigInt(77), getDetails)).resolves.toEqual({
			status: 'updated',
			snapshot: {
				steamDependencies: [BigInt(11)],
				steamDependencyNames: {
					'11': 'Harmony (2.2.2)'
				},
				steamDependenciesFetchedAt: expect.any(Number)
			}
		});
		expect(getDetails).toHaveBeenNthCalledWith(1, [BigInt(77)]);
		expect(getDetails).toHaveBeenNthCalledWith(2, [BigInt(11)]);
	});

	it('returns unknown when Steamworks omits dependency children', async () => {
		const getDetails = vi.fn().mockResolvedValueOnce([
			createWorkshopDetails({
				publishedFileId: BigInt(77),
				title: 'Parent',
				children: undefined
			})
		]);

		await expect(fetchWorkshopDependencySnapshot(BigInt(77), getDetails, 1777777777777)).resolves.toEqual({
			status: 'unknown',
			checkedAt: 1777777777777
		});
	});

	it('returns failed when Steamworks details are unavailable', async () => {
		const getDetails = vi.fn().mockRejectedValueOnce(new Error('Steamworks unavailable'));

		await expect(fetchWorkshopDependencySnapshot(BigInt(77), getDetails)).resolves.toEqual({ status: 'failed' });
	});

	it('returns failed when Steamworks returns a non-success item result', async () => {
		const getDetails = vi.fn().mockResolvedValueOnce([
			createWorkshopDetails({
				publishedFileId: BigInt(77),
				title: 'Parent',
				result: EResult.k_EResultFail
			})
		]);

		await expect(fetchWorkshopDependencySnapshot(BigInt(77), getDetails)).resolves.toEqual({ status: 'failed' });
	});
});

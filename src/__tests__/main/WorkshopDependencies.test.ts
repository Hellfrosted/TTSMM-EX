import { describe, expect, it, vi } from 'vitest';
import {
	applyWorkshopDependencySnapshotResult,
	createWorkshopDependencySnapshotMetadata,
	createWorkshopDependencySnapshot,
	fetchWorkshopDependencySnapshot,
	ingestWorkshopDependencySnapshotBatch,
	resolveWorkshopDependencyNames
} from '../../main/workshop-dependencies';
import { EResult } from '../../main/steamworks/types';
import { createWorkshopDetails } from './test-utils';

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

	it('creates checked-unknown metadata when successful Steamworks details omit dependency children', () => {
		const metadata = createWorkshopDependencySnapshotMetadata(
			createWorkshopDetails({
				publishedFileId: BigInt(77),
				title: 'Parent',
				children: undefined
			}),
			new Map(),
			1777777777777
		);

		expect(metadata).toStrictEqual({
			steamDependencies: undefined,
			steamDependencyNames: undefined,
			steamDependenciesFetchedAt: 1777777777777
		});
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

	it('ingests known, known-empty, unknown, and failed dependency snapshots as one batch', async () => {
		const fetchedAt = 1777777777777;
		const getDetails = vi.fn(async (workshopIDs: bigint[]) => {
			expect(workshopIDs).toEqual([BigInt(11)]);
			return [createWorkshopDetails({ publishedFileId: BigInt(11), title: 'Harmony (2.2.2)' })];
		});

		const snapshots = await ingestWorkshopDependencySnapshotBatch(
			[
				createWorkshopDetails({
					publishedFileId: BigInt(77),
					title: 'Known Parent',
					children: [BigInt(11)]
				}),
				createWorkshopDetails({
					publishedFileId: BigInt(78),
					title: 'Known Empty Parent',
					children: []
				}),
				createWorkshopDetails({
					publishedFileId: BigInt(79),
					title: 'Unknown Parent',
					children: undefined
				}),
				createWorkshopDetails({
					publishedFileId: BigInt(80),
					title: 'Failed Parent',
					children: [BigInt(22)],
					result: EResult.k_EResultFail
				})
			],
			{ getDetailsForWorkshopModList: getDetails, now: fetchedAt }
		);

		expect(snapshots).toEqual(
			new Map([
				[
					BigInt(77),
					{
						status: 'updated',
						snapshot: {
							steamDependencies: [BigInt(11)],
							steamDependencyNames: {
								'11': 'Harmony (2.2.2)'
							},
							steamDependenciesFetchedAt: fetchedAt
						}
					}
				],
				[
					BigInt(78),
					{
						status: 'updated',
						snapshot: {
							steamDependencies: [],
							steamDependenciesFetchedAt: fetchedAt
						}
					}
				],
				[BigInt(79), { status: 'unknown', checkedAt: fetchedAt }],
				[BigInt(80), { status: 'failed' }]
			])
		);
		expect(getDetails).toHaveBeenCalledTimes(1);
	});

	it('applies dependency snapshot results without overwriting on failed refreshes', () => {
		const mod = {
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Previous Name'
			},
			steamDependenciesFetchedAt: 1
		};

		applyWorkshopDependencySnapshotResult(mod, { status: 'unknown', checkedAt: 1777777777777 });
		expect(mod).toEqual({
			steamDependencies: undefined,
			steamDependencyNames: undefined,
			steamDependenciesFetchedAt: 1777777777777
		});

		applyWorkshopDependencySnapshotResult(mod, { status: 'failed' });
		expect(mod).toEqual({
			steamDependencies: undefined,
			steamDependencyNames: undefined,
			steamDependenciesFetchedAt: 1777777777777
		});
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

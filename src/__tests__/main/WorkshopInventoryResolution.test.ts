import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, describe, expect, vi, it as vitestIt } from 'vitest';
import { ModInventoryProgress } from '../../main/mod-inventory-progress';
import { buildWorkshopModBatch, resolveWorkshopDependencyChunk, scanWorkshopInventory } from '../../main/mod-workshop-inventory';
import Steamworks from '../../main/steamworks';
import { WorkshopInventoryResolver } from '../../main/workshop-inventory-resolution';
import { type ModData, ModType } from '../../model';
import { createWorkshopDetails } from './test-utils';

describe('WorkshopInventoryResolver', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	vitestIt('tracks resolved workshop mods and queues missing dependencies', () => {
		const loadedDependency = BigInt(2);
		const missingDependency = BigInt(3);
		const pendingWorkshopMods = new Set([loadedDependency]);
		const resolver = new WorkshopInventoryResolver(pendingWorkshopMods);

		resolver.addResolvedMod({
			uid: `workshop:${loadedDependency}`,
			id: 'Dependency',
			type: ModType.WORKSHOP,
			workshopID: loadedDependency,
			steamDependencies: [missingDependency]
		});
		const queuedDependencies = resolver.queueMissingDependencies(resolver.getWorkshopMods());

		expect(queuedDependencies).toEqual(new Set([missingDependency]));
		expect(resolver.pendingWorkshopMods).toEqual(new Set([missingDependency]));
		expect(resolver.getWorkshopMods()).toEqual([
			expect.objectContaining({
				uid: `workshop:${loadedDependency}`,
				workshopID: loadedDependency
			})
		]);
	});

	vitestIt('moves unresolved pending workshop ids to invalid before replacing the next pass', () => {
		const invalidDependency = BigInt(4);
		const nextDependency = BigInt(5);
		const resolver = new WorkshopInventoryResolver(new Set([invalidDependency]));

		expect(resolver.markPendingWorkshopModsInvalid()).toEqual(new Set([invalidDependency]));
		resolver.replacePendingWorkshopMods([invalidDependency, nextDependency]);

		expect(resolver.knownInvalidMods).toEqual(new Set([invalidDependency]));
		expect(resolver.pendingWorkshopMods).toEqual(new Set([nextDependency]));
	});

	it.effect('expands dependencies from Steamworks dependency snapshots', () =>
		Effect.gen(function* () {
			const workshopID = BigInt(20);
			const dependencyID = BigInt(21);
			const workshopMap = new Map<bigint, ModData>();
			const knownInvalidMods = new Set<bigint>();

			const missingDependencies = yield* resolveWorkshopDependencyChunk(workshopMap, knownInvalidMods, new Set([workshopID]), {
				getDetailsForWorkshopModList: () =>
					Effect.succeed([
						{
							uid: `workshop:${workshopID}`,
							id: 'Parent',
							type: ModType.WORKSHOP,
							workshopID,
							steamDependencies: [dependencyID],
							steamDependencyNames: {
								[dependencyID.toString()]: 'Dependency'
							}
						}
					]),
				knownWorkshopMods: new Set([workshopID]),
				updateModLoadingProgress: () => undefined
			});

			expect(missingDependencies).toEqual(new Set([dependencyID]));
			expect(workshopMap.get(workshopID)).toEqual(
				expect.objectContaining({
					steamDependencies: [dependencyID],
					steamDependencyNames: {
						[dependencyID.toString()]: 'Dependency'
					}
				})
			);
		})
	);

	it.effect('reports coarse unresolved reasons while building workshop mods', () =>
		Effect.gen(function* () {
			const nonModWorkshopID = BigInt(30);
			const hydrationFailedWorkshopID = BigInt(31);
			const validWorkshopID = BigInt(32);

			const outcome = yield* buildWorkshopModBatch(
				[
					createWorkshopDetails({
						publishedFileId: nonModWorkshopID,
						tags: ['Screenshots'],
						tagsDisplayNames: ['Screenshots']
					}),
					createWorkshopDetails({
						publishedFileId: hydrationFailedWorkshopID,
						tags: ['Mods'],
						tagsDisplayNames: ['Mods']
					}),
					createWorkshopDetails({
						publishedFileId: validWorkshopID,
						tags: ['Mods'],
						tagsDisplayNames: ['Mods']
					})
				],
				(workshopID) =>
					Effect.succeed(
						workshopID === validWorkshopID
							? {
									uid: `workshop:${validWorkshopID}`,
									id: 'Valid',
									type: ModType.WORKSHOP,
									workshopID: validWorkshopID
								}
							: null
					)
			);

			expect(outcome.mods).toEqual([
				expect.objectContaining({
					uid: `workshop:${validWorkshopID}`,
					workshopID: validWorkshopID
				})
			]);
			expect(outcome.unresolvedWorkshopItems).toEqual([
				{ workshopID: nonModWorkshopID, reason: 'non-mod' },
				{ workshopID: hydrationFailedWorkshopID, reason: 'hydration-failed' }
			]);
		})
	);

	it.effect('keeps the richer workshop scan outcome behind the workshop inventory seam', () =>
		Effect.gen(function* () {
			vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
			vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(false);

			const outcome = yield* scanWorkshopInventory({
				buildWorkshopMod: () => Effect.fail(new Error('should not hydrate skipped workshop scans')),
				getDetailsForWorkshopModList: () => Effect.fail(new Error('should not fetch skipped workshop scans')),
				knownWorkshopMods: new Set([BigInt(40)]),
				platform: 'linux',
				progress: new ModInventoryProgress({ send: () => undefined }),
				updateModLoadingProgress: () => undefined
			});

			expect(outcome).toEqual({
				mods: [],
				stats: {
					dependencyItems: 0,
					knownItems: 0,
					subscribedItems: 0
				},
				unresolvedWorkshopItems: []
			});
		})
	);
});

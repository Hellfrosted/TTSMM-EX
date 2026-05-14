import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, describe, expect, vi, it as vitestIt } from 'vitest';
import { ModInventoryProgress } from '../../main/mod-inventory-progress';
import { buildWorkshopModBatch, resolveWorkshopDependencyChunk, scanWorkshopInventory } from '../../main/mod-workshop-inventory';
import Steamworks from '../../main/steamworks';
import {
	applyWorkshopInventorySubscribedPageTransition,
	createWorkshopInventorySubscribedPageTransition,
	expandPendingWorkshopDependencies,
	WorkshopInventoryExpansion,
	type WorkshopInventoryProgressEffect
} from '../../main/workshop-inventory-expansion';
import { type ModData, ModType } from '../../model';
import { createWorkshopDetails } from './test-utils';

describe('WorkshopInventoryExpansion', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	vitestIt('tracks resolved workshop mods and queues missing dependencies', () => {
		const loadedDependency = BigInt(2);
		const missingDependency = BigInt(3);
		const pendingWorkshopMods = new Set([loadedDependency]);
		const resolver = new WorkshopInventoryExpansion(pendingWorkshopMods);

		resolver.addResolvedMod({
			uid: `workshop:${loadedDependency}`,
			id: 'Dependency',
			type: ModType.WORKSHOP,
			workshopID: loadedDependency,
			steamDependencies: [missingDependency]
		});
		const queuedDependencies = resolver.queueMissingDependencies(resolver.getWorkshopMods());

		expect(pendingWorkshopMods).toEqual(new Set([loadedDependency]));
		expect(queuedDependencies).toEqual(new Set([missingDependency]));
		expect(resolver.getPendingWorkshopMods()).toEqual(new Set([missingDependency]));
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
		const resolver = new WorkshopInventoryExpansion(new Set([invalidDependency]));

		expect(resolver.markPendingWorkshopModsInvalid()).toEqual(new Set([invalidDependency]));
		resolver.replacePendingWorkshopMods([invalidDependency, nextDependency]);

		expect(resolver.getKnownInvalidWorkshopMods()).toEqual(new Set([invalidDependency]));
		expect(resolver.getPendingWorkshopMods()).toEqual(new Set([nextDependency]));
	});

	vitestIt('prefers installed duplicate workshop records over metadata-only records', () => {
		const workshopID = BigInt(6);
		const resolver = new WorkshopInventoryExpansion();

		resolver.addResolvedMod(
			{
				uid: `workshop:${workshopID}`,
				id: null,
				name: 'Metadata only',
				type: ModType.WORKSHOP,
				workshopID
			},
			'known'
		);
		const duplicateResult = resolver.addResolvedMod(
			{
				uid: `workshop:${workshopID}`,
				id: 'InstalledMod',
				name: 'Installed mod',
				path: '/mods/InstalledMod',
				type: ModType.WORKSHOP,
				workshopID
			},
			'dependency'
		);

		expect(duplicateResult).toBe('replaced-duplicate');
		expect(resolver.getWorkshopMods()).toEqual([
			expect.objectContaining({
				id: 'InstalledMod',
				name: 'Installed mod',
				workshopID
			})
		]);
	});

	vitestIt('prefers explicitly known workshop records over dependency records at equal quality', () => {
		const workshopID = BigInt(7);
		const resolver = new WorkshopInventoryExpansion();

		resolver.addResolvedMod(
			{
				uid: `workshop:${workshopID}`,
				id: null,
				name: 'Dependency source',
				type: ModType.WORKSHOP,
				workshopID
			},
			'dependency'
		);
		const duplicateResult = resolver.addResolvedMod(
			{
				uid: `workshop:${workshopID}`,
				id: null,
				name: 'Known source',
				type: ModType.WORKSHOP,
				workshopID
			},
			'known'
		);

		expect(duplicateResult).toBe('replaced-duplicate');
		expect(resolver.getWorkshopMods()).toEqual([
			expect.objectContaining({
				name: 'Known source',
				workshopID
			})
		]);
	});

	vitestIt('applies subscribed page observations through the workshop inventory expansion policy', () => {
		const subscribedWorkshopID = BigInt(8);
		const knownWorkshopID = BigInt(9);
		const duplicateWorkshopID = BigInt(10);
		const expansion = new WorkshopInventoryExpansion();

		expansion.addResolvedMod(
			{
				uid: `workshop:${duplicateWorkshopID}`,
				id: 'Existing',
				name: 'Existing installed mod',
				path: '/mods/Existing',
				type: ModType.WORKSHOP,
				workshopID: duplicateWorkshopID
			},
			'subscribed'
		);

		const transition = createWorkshopInventorySubscribedPageTransition(new Set([knownWorkshopID]), {
			builtPageMods: {
				mods: [
					{
						uid: `workshop:${subscribedWorkshopID}`,
						id: 'Subscribed',
						type: ModType.WORKSHOP,
						workshopID: subscribedWorkshopID
					},
					{
						uid: `workshop:${duplicateWorkshopID}`,
						id: null,
						name: 'Duplicate metadata',
						type: ModType.WORKSHOP,
						workshopID: duplicateWorkshopID
					}
				],
				unresolvedWorkshopItems: [{ workshopID: BigInt(11), reason: 'non-mod' }]
			},
			missingDetailMods: {
				mods: [
					{
						uid: `workshop:${knownWorkshopID}`,
						id: null,
						name: 'Known metadata',
						type: ModType.WORKSHOP,
						workshopID: knownWorkshopID
					}
				],
				unresolvedWorkshopItems: []
			},
			page: {
				items: [],
				numReturned: 2,
				totalItems: 3
			}
		});

		expect(transition).toEqual({
			progressEffect: { type: 'set-workshop-total', total: 3 },
			resolvedRecords: [
				expect.objectContaining({
					mod: expect.objectContaining({ workshopID: subscribedWorkshopID }),
					source: 'subscribed'
				}),
				expect.objectContaining({
					mod: expect.objectContaining({ workshopID: duplicateWorkshopID }),
					source: 'subscribed'
				}),
				expect.objectContaining({
					mod: expect.objectContaining({ workshopID: knownWorkshopID }),
					source: 'known'
				})
			],
			subscribedItems: 2,
			unresolvedWorkshopItems: [{ workshopID: BigInt(11), reason: 'non-mod' }]
		});
		expect(expansion.getWorkshopMods()).toEqual([
			expect.objectContaining({
				id: 'Existing',
				workshopID: duplicateWorkshopID
			})
		]);

		applyWorkshopInventorySubscribedPageTransition(expansion, transition);

		expect(expansion.getWorkshopMods()).toEqual([
			expect.objectContaining({
				id: 'Existing',
				workshopID: duplicateWorkshopID
			}),
			expect.objectContaining({
				id: 'Subscribed',
				workshopID: subscribedWorkshopID
			}),
			expect.objectContaining({
				name: 'Known metadata',
				workshopID: knownWorkshopID
			})
		]);
		expect(expansion.getUnresolvedWorkshopItems()).toEqual([
			{ workshopID: BigInt(11), reason: 'non-mod' },
			{ workshopID: duplicateWorkshopID, reason: 'duplicate' }
		]);
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
				knownWorkshopMods: new Set([workshopID])
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

	it.effect('emits progress effects and merges dependency results while expanding pending workshop mods', () =>
		Effect.gen(function* () {
			const parentWorkshopID = BigInt(22);
			const dependencyWorkshopID = BigInt(23);
			const expansion = new WorkshopInventoryExpansion(new Set([parentWorkshopID]));
			const progressEffects: WorkshopInventoryProgressEffect[] = [];

			const dependencyItems = yield* expandPendingWorkshopDependencies(expansion, {
				adapters: {
					getDetailsForWorkshopModList: (workshopIDs) =>
						Effect.succeed(
							workshopIDs.map((workshopID) => ({
								uid: `workshop:${workshopID}`,
								id: workshopID === parentWorkshopID ? 'Parent' : 'Dependency',
								type: ModType.WORKSHOP,
								workshopID,
								steamDependencies: workshopID === parentWorkshopID ? [dependencyWorkshopID] : undefined
							}))
						),
					knownWorkshopMods: new Set([parentWorkshopID])
				},
				onProgressEffect: (effect) => {
					progressEffects.push(effect);
				}
			});

			expect(dependencyItems).toBe(2);
			expect(progressEffects).toEqual([
				{ type: 'increment-workshop-total', count: 1 },
				{ type: 'increment-workshop-total', count: 1 }
			]);
			expect(expansion.getWorkshopMods()).toEqual([
				expect.objectContaining({
					id: 'Parent',
					workshopID: parentWorkshopID
				}),
				expect.objectContaining({
					id: 'Dependency',
					workshopID: dependencyWorkshopID
				})
			]);
			expect(expansion.getUnresolvedWorkshopItems()).toEqual([]);
			expect(expansion.getPendingWorkshopMods()).toEqual(new Set());
		})
	);

	it.effect('keeps explicit known source precedence when known mods expand through dependency resolution', () =>
		Effect.gen(function* () {
			const knownWorkshopID = BigInt(24);
			const expansion = new WorkshopInventoryExpansion(new Set([knownWorkshopID]));

			yield* expandPendingWorkshopDependencies(expansion, {
				adapters: {
					getDetailsForWorkshopModList: (workshopIDs, keepUnknownWorkshopItem) =>
						Effect.succeed(
							workshopIDs.flatMap((workshopID) =>
								keepUnknownWorkshopItem?.(workshopID)
									? [
											{
												uid: `workshop:${workshopID}`,
												id: null,
												name: 'Known metadata',
												type: ModType.WORKSHOP,
												workshopID
											}
										]
									: []
							)
						),
					knownWorkshopMods: new Set([knownWorkshopID])
				}
			});

			const duplicateResult = expansion.addResolvedMod(
				{
					uid: `workshop:${knownWorkshopID}`,
					id: null,
					name: 'Dependency metadata',
					type: ModType.WORKSHOP,
					workshopID: knownWorkshopID
				},
				'dependency'
			);

			expect(duplicateResult).toBe('discarded-duplicate');
			expect(expansion.getWorkshopMods()).toEqual([
				expect.objectContaining({
					name: 'Known metadata',
					workshopID: knownWorkshopID
				})
			]);
			expect(expansion.getUnresolvedWorkshopItems()).toEqual([]);
		})
	);

	it.effect('reports dependency metadata failures through progress effects', () =>
		Effect.gen(function* () {
			const failedWorkshopID = BigInt(25);
			const expansion = new WorkshopInventoryExpansion(new Set([failedWorkshopID]));
			const progressEffects: WorkshopInventoryProgressEffect[] = [];

			yield* expandPendingWorkshopDependencies(expansion, {
				adapters: {
					getDetailsForWorkshopModList: () => Effect.fail(new Error('metadata unavailable')),
					knownWorkshopMods: new Set()
				},
				onProgressEffect: (effect) => {
					progressEffects.push(effect);
				}
			});

			expect(progressEffects).toEqual([
				{ type: 'increment-workshop-total', count: 1 },
				{ type: 'increment-loaded-mods', count: 1 }
			]);
			expect(expansion.getUnresolvedWorkshopItems()).toEqual([{ workshopID: failedWorkshopID, reason: 'metadata-failed' }]);
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
				progress: new ModInventoryProgress({ send: () => undefined })
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

	it.effect('merges dependency expansion results into the shared workshop scan outcome', () =>
		Effect.gen(function* () {
			const parentWorkshopID = BigInt(50);
			const dependencyWorkshopID = BigInt(51);
			vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
				props.success_callback(
					props.options?.page_num === 1
						? {
								items: [
									createWorkshopDetails({
										publishedFileId: parentWorkshopID,
										title: 'Parent',
										tags: ['Mods'],
										tagsDisplayNames: ['Mods'],
										children: [dependencyWorkshopID]
									})
								],
								totalItems: 1,
								numReturned: 1
							}
						: {
								items: [],
								totalItems: 1,
								numReturned: 0
							}
				);
			});
			const progress = new ModInventoryProgress({ send: () => undefined });
			const outcome = yield* scanWorkshopInventory({
				buildWorkshopMod: (workshopID, steamUGCDetails) =>
					Effect.succeed({
						uid: `workshop:${workshopID}`,
						id: workshopID === parentWorkshopID ? 'Parent' : null,
						name: steamUGCDetails?.title,
						type: ModType.WORKSHOP,
						workshopID,
						steamDependencies: workshopID === parentWorkshopID ? [dependencyWorkshopID] : undefined
					}),
				getDetailsForWorkshopModList: () =>
					Effect.succeed([
						{
							uid: `workshop:${dependencyWorkshopID}`,
							id: null,
							name: 'Dependency',
							type: ModType.WORKSHOP,
							workshopID: dependencyWorkshopID
						}
					]),
				knownWorkshopMods: new Set<bigint>(),
				platform: 'win32',
				progress
			});

			expect(outcome.mods).toEqual([
				expect.objectContaining({
					id: 'Parent',
					workshopID: parentWorkshopID
				}),
				expect.objectContaining({
					id: null,
					name: 'Dependency',
					workshopID: dependencyWorkshopID
				})
			]);
			expect(outcome.stats).toEqual({
				dependencyItems: 1,
				knownItems: 0,
				subscribedItems: 1
			});
			expect(progress.workshopMods).toBe(2);
		})
	);

	it.effect('preserves known workshop inputs while scanning the Windows workshop inventory', () =>
		Effect.gen(function* () {
			const knownWorkshopID = BigInt(60);
			const knownWorkshopMods = new Set([knownWorkshopID]);
			vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
				props.success_callback(
					props.options?.page_num === 1
						? {
								items: [
									createWorkshopDetails({
										publishedFileId: knownWorkshopID,
										title: 'Known mod',
										tags: ['Mods'],
										tagsDisplayNames: ['Mods']
									})
								],
								totalItems: 1,
								numReturned: 1
							}
						: {
								items: [],
								totalItems: 1,
								numReturned: 0
							}
				);
			});

			const outcome = yield* scanWorkshopInventory({
				buildWorkshopMod: (workshopID, steamUGCDetails) =>
					Effect.succeed({
						uid: `workshop:${workshopID}`,
						id: null,
						name: steamUGCDetails?.title,
						type: ModType.WORKSHOP,
						workshopID
					}),
				getDetailsForWorkshopModList: () => Effect.succeed([]),
				knownWorkshopMods,
				platform: 'win32',
				progress: new ModInventoryProgress({ send: () => undefined })
			});

			expect(knownWorkshopMods).toEqual(new Set([knownWorkshopID]));
			expect(outcome.stats).toEqual({
				dependencyItems: 0,
				knownItems: 1,
				subscribedItems: 1
			});
			expect(outcome.mods).toEqual([
				expect.objectContaining({
					name: 'Known mod',
					workshopID: knownWorkshopID
				})
			]);
		})
	);

	it.effect('expands Windows known-only workshop inputs without counting them as subscribed items', () =>
		Effect.gen(function* () {
			const knownWorkshopID = BigInt(61);
			vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
				props.success_callback({
					items: [],
					totalItems: 0,
					numReturned: 0
				});
			});
			const progress = new ModInventoryProgress({ send: () => undefined });

			const outcome = yield* scanWorkshopInventory({
				buildWorkshopMod: () => Effect.fail(new Error('known-only Windows inputs should hydrate through dependency expansion')),
				getDetailsForWorkshopModList: (workshopIDs) =>
					Effect.succeed(
						workshopIDs.map((workshopID) => ({
							uid: `workshop:${workshopID}`,
							id: null,
							name: 'Known-only metadata',
							type: ModType.WORKSHOP,
							workshopID
						}))
					),
				knownWorkshopMods: new Set([knownWorkshopID]),
				platform: 'win32',
				progress
			});

			expect(outcome.stats).toEqual({
				dependencyItems: 1,
				knownItems: 1,
				subscribedItems: 0
			});
			expect(outcome.mods).toEqual([
				expect.objectContaining({
					name: 'Known-only metadata',
					workshopID: knownWorkshopID
				})
			]);
			expect(progress.workshopMods).toBe(1);
		})
	);

	it.effect('uses the Linux synthetic page total for subscribed plus known workshop inputs', () =>
		Effect.gen(function* () {
			const subscribedWorkshopID = BigInt(70);
			const knownWorkshopID = BigInt(71);
			vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
			vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
			vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([subscribedWorkshopID]);
			vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((ids, successCallback) => {
				successCallback(
					ids.map((id) =>
						createWorkshopDetails({
							publishedFileId: BigInt(id),
							title: id === subscribedWorkshopID.toString() ? 'Subscribed mod' : 'Known mod',
							tags: ['Mods'],
							tagsDisplayNames: ['Mods']
						})
					)
				);
			});
			const progress = new ModInventoryProgress({ send: () => undefined });

			const outcome = yield* scanWorkshopInventory({
				buildWorkshopMod: (workshopID, steamUGCDetails) =>
					Effect.succeed({
						uid: `workshop:${workshopID}`,
						id: workshopID === subscribedWorkshopID ? 'Subscribed' : null,
						name: steamUGCDetails?.title,
						type: ModType.WORKSHOP,
						workshopID
					}),
				getDetailsForWorkshopModList: () => Effect.fail(new Error('known Linux input should resolve through the synthetic page')),
				knownWorkshopMods: new Set([knownWorkshopID]),
				platform: 'linux',
				progress
			});

			expect(outcome.stats).toEqual({
				dependencyItems: 0,
				knownItems: 1,
				subscribedItems: 1
			});
			expect(outcome.mods).toEqual([
				expect.objectContaining({
					name: 'Subscribed mod',
					workshopID: subscribedWorkshopID
				}),
				expect.objectContaining({
					name: 'Known mod',
					workshopID: knownWorkshopID
				})
			]);
			expect(progress.workshopMods).toBe(2);
		})
	);
});

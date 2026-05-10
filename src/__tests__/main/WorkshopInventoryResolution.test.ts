import { describe, expect, it } from 'vitest';
import { resolveWorkshopDependencyChunk } from '../../main/mod-workshop-inventory';
import { WorkshopInventoryResolver } from '../../main/workshop-inventory-resolution';
import { ModType, type ModData } from '../../model';
import { WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS } from '../../shared/workshop-dependency-lookup';

describe('WorkshopInventoryResolver', () => {
	it('tracks resolved workshop mods and queues missing dependencies', () => {
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

	it('moves unresolved pending workshop ids to invalid before replacing the next pass', () => {
		const invalidDependency = BigInt(4);
		const nextDependency = BigInt(5);
		const resolver = new WorkshopInventoryResolver(new Set([invalidDependency]));

		expect(resolver.markPendingWorkshopModsInvalid()).toEqual(new Set([invalidDependency]));
		resolver.replacePendingWorkshopMods([invalidDependency, nextDependency]);

		expect(resolver.knownInvalidMods).toEqual(new Set([invalidDependency]));
		expect(resolver.pendingWorkshopMods).toEqual(new Set([nextDependency]));
	});

	it('selects only missing or stale dependency snapshots for fallback refresh', () => {
		const now = new Date('2026-05-03T12:00:00Z').getTime();
		const freshWorkshopID = BigInt(10);
		const missingWorkshopID = BigInt(11);
		const staleWorkshopID = BigInt(12);
		const thresholdWorkshopID = BigInt(13);
		const resolver = new WorkshopInventoryResolver();

		expect(
			resolver.getDependencyRefreshCandidates(
				[
					{
						uid: `workshop:${freshWorkshopID}`,
						id: 'Fresh',
						type: ModType.WORKSHOP,
						workshopID: freshWorkshopID,
						steamDependencies: [],
						steamDependenciesFetchedAt: now
					},
					{
						uid: `workshop:${missingWorkshopID}`,
						id: 'Missing',
						type: ModType.WORKSHOP,
						workshopID: missingWorkshopID
					},
					{
						uid: `workshop:${staleWorkshopID}`,
						id: 'Stale',
						type: ModType.WORKSHOP,
						workshopID: staleWorkshopID,
						steamDependencies: [],
						steamDependenciesFetchedAt: now - WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS - 1
					},
					{
						uid: `workshop:${thresholdWorkshopID}`,
						id: 'Threshold',
						type: ModType.WORKSHOP,
						workshopID: thresholdWorkshopID,
						steamDependencies: [],
						steamDependenciesFetchedAt: now - WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS
					}
				],
				now
			)
		).toEqual(new Set([missingWorkshopID, staleWorkshopID, thresholdWorkshopID]));
	});

	it('refreshes dependency snapshots before computing dependency expansion', async () => {
		const workshopID = BigInt(20);
		const dependencyID = BigInt(21);
		const workshopMap = new Map<bigint, ModData>();
		const knownInvalidMods = new Set<bigint>();

		const missingDependencies = await resolveWorkshopDependencyChunk(workshopMap, knownInvalidMods, new Set([workshopID]), {
			getDetailsForWorkshopModList: async () => [
				{
					uid: `workshop:${workshopID}`,
					id: 'Parent',
					type: ModType.WORKSHOP,
					workshopID
				}
			],
			knownWorkshopMods: new Set([workshopID]),
			refreshWorkshopDependencies: async () => ({
				steamDependencies: [dependencyID],
				steamDependencyNames: {
					[dependencyID.toString()]: 'Dependency'
				},
				steamDependenciesFetchedAt: Date.now()
			}),
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
	});
});

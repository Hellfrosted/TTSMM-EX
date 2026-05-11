import { describe, expect, it as vitestIt } from 'vitest';
import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { resolveWorkshopDependencyChunk } from '../../main/mod-workshop-inventory';
import { WorkshopInventoryResolver } from '../../main/workshop-inventory-resolution';
import { ModType, type ModData } from '../../model';

describe('WorkshopInventoryResolver', () => {
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
});

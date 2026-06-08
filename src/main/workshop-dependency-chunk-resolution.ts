import { Effect } from 'effect';
import type { ModData } from '../model';
import { chunkWorkshopIds } from './mod-workshop-metadata';
import type { SteamPersonaCache } from './steam-persona-cache';
import { WorkshopInventoryExpansion } from './workshop-inventory-expansion-state';
import { getWorkshopInventorySourceForKnownItem } from './workshop-inventory-source-policy';
import type {
	WorkshopDependencyChunkOutcome,
	WorkshopDependencyExpansionAdapters,
	WorkshopInventoryDependencyExpansionOptions,
	WorkshopInventoryResolvedRecord
} from './workshop-inventory-types';
import { hasUnresolvedWorkshopItem } from './workshop-inventory-unresolved-policy';

export const resolveWorkshopDependencyChunkOutcome = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<WorkshopDependencyChunkOutcome, unknown, SteamPersonaCache> {
	const modChunks = chunkWorkshopIds([...modList]);

	const expansion = new WorkshopInventoryExpansion(modList, workshopMap, knownInvalidMods, adapters.options);
	const modDependencies: Set<bigint> = new Set();
	const resolvedRecords: WorkshopInventoryResolvedRecord[] = [];

	for (let i = 0; i < modChunks.length; i++) {
		const requestedWorkshopIDs = new Set(modChunks[i]);
		let metadataFailed = false;
		const modDetails = yield* adapters
			.getDetailsForWorkshopModList(
				modChunks[i],
				(workshopID) => adapters.keepUnknownWorkshopItem?.(workshopID) ?? adapters.knownWorkshopMods.has(workshopID)
			)
			.pipe(
				Effect.catch(() => {
					adapters.onProgressEffect?.({ type: 'increment-loaded-mods', count: modChunks[i].length });
					metadataFailed = true;
					return Effect.succeed<ModData[]>([]);
				})
			);
		if (metadataFailed) {
			expansion.recordMetadataFailures(requestedWorkshopIDs);
			continue;
		}
		const chunkResolvedRecords: WorkshopInventoryResolvedRecord[] = [];
		modDetails.forEach((mod: ModData) => {
			if (mod.workshopID !== undefined) {
				requestedWorkshopIDs.delete(mod.workshopID);
				chunkResolvedRecords.push({
					mod,
					source: getWorkshopInventorySourceForKnownItem(mod.workshopID, adapters.knownWorkshopMods, 'dependency')
				});
			}
		});
		resolvedRecords.push(...chunkResolvedRecords);
		expansion.addResolvedRecords(chunkResolvedRecords);
		for (const workshopID of requestedWorkshopIDs) {
			expansion.recordUnresolvedWorkshopItem({
				workshopID,
				reason: 'hydration-failed'
			});
		}

		expansion.collectMissingDependencies(modDetails).forEach((missingDependency) => modDependencies.add(missingDependency));
	}

	return {
		missingDependencies: modDependencies,
		resolvedRecords,
		unresolvedWorkshopItems: expansion.getUnresolvedWorkshopItems()
	};
});

export const resolveWorkshopDependencyChunk = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<Set<bigint>, unknown, SteamPersonaCache> {
	const outcome = yield* resolveWorkshopDependencyChunkOutcome(workshopMap, knownInvalidMods, modList, adapters);
	const expansion = new WorkshopInventoryExpansion(modList, workshopMap, knownInvalidMods, adapters.options);
	expansion.addResolvedRecords(outcome.resolvedRecords);
	workshopMap.clear();
	expansion.getResolvedWorkshopModMap().forEach((mod, workshopID) => {
		workshopMap.set(workshopID, mod);
	});
	return outcome.missingDependencies;
});

export const expandPendingWorkshopDependencies = Effect.fnUntraced(function* (
	expansion: WorkshopInventoryExpansion,
	{ adapters, onProgressEffect }: WorkshopInventoryDependencyExpansionOptions
): Effect.fn.Return<number, unknown, SteamPersonaCache> {
	let dependencyItems = 0;
	let missingKnownWorkshopMods = expansion.getPendingWorkshopMods();

	while (expansion.hasPendingWorkshopMods()) {
		onProgressEffect?.({ type: 'increment-workshop-total', count: missingKnownWorkshopMods.size });
		dependencyItems += missingKnownWorkshopMods.size;

		const dependencyWorkshopMap = expansion.getResolvedWorkshopModMap();
		const dependencyChunkOutcome = yield* resolveWorkshopDependencyChunkOutcome(
			dependencyWorkshopMap,
			expansion.getKnownInvalidWorkshopMods(),
			missingKnownWorkshopMods,
			{
				...adapters,
				onProgressEffect
			}
		);
		expansion.addUnresolvedWorkshopItems(dependencyChunkOutcome.unresolvedWorkshopItems);
		expansion.addResolvedRecords(dependencyChunkOutcome.resolvedRecords);
		missingKnownWorkshopMods = dependencyChunkOutcome.missingDependencies;
		expansion.markPendingWorkshopModsInvalid().forEach((workshopID) => {
			if (hasUnresolvedWorkshopItem(expansion.getUnresolvedWorkshopItems(), workshopID)) {
				return;
			}
			expansion.recordUnresolvedWorkshopItem({
				workshopID,
				reason: 'hydration-failed'
			});
		});
		expansion.replacePendingWorkshopMods(missingKnownWorkshopMods);
	}

	return dependencyItems;
});

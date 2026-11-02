import { Effect } from 'effect';
import type { ModData } from '../model';
import type { SteamPersonaCache } from './steam-persona-cache';
import { WorkshopInventoryExpansion } from './workshop-inventory-expansion-state';
import type {
	WorkshopDependencyEffect,
	WorkshopDependencyExpansionAdapters,
	WorkshopInventoryDependencyExpansionOptions
} from './workshop-inventory-types';

const runDependencyExpansion = Effect.fnUntraced(function* (
	expansion: WorkshopInventoryExpansion,
	adapters: WorkshopDependencyExpansionAdapters,
	onProgressEffect: WorkshopInventoryDependencyExpansionOptions['onProgressEffect'],
	onePass = false
): Effect.fn.Return<number, unknown, SteamPersonaCache> {
	let effects: WorkshopDependencyEffect[] = expansion.startDependencyExpansion();
	let passes = 0;
	while (effects.length > 0) {
		const effect = effects.shift()!;
		if (effect.type === 'dependency-expansion-complete') return effect.dependencyItems;
		if (effect.type === 'increment-workshop-total') {
			if (onePass && passes++ > 0) return 0;
			if (!onePass) onProgressEffect?.(effect);
		} else if (effect.type === 'increment-loaded-mods' || effect.type === 'set-workshop-total') {
			onProgressEffect?.(effect);
		} else if (effect.type === 'fetch-dependency-chunk') {
			const observation = yield* adapters
				.getDetailsForWorkshopModList(
					effect.workshopIDs,
					(workshopID) => adapters.keepUnknownWorkshopItem?.(workshopID) ?? adapters.knownWorkshopMods.has(workshopID)
				)
				.pipe(
					Effect.map((mods) => ({ type: 'success' as const, mods })),
					Effect.catch(() => Effect.succeed({ type: 'metadata-failed' as const }))
				);
			effects.push(...expansion.observeDependencyChunk(observation, adapters.knownWorkshopMods));
		}
	}
	throw new Error('Dependency expansion ended without a completion effect');
});

export const resolveWorkshopDependencyChunk = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<Set<bigint>, unknown, SteamPersonaCache> {
	const expansion = new WorkshopInventoryExpansion(modList, workshopMap, knownInvalidMods, adapters.options);
	yield* runDependencyExpansion(expansion, adapters, adapters.onProgressEffect, true);
	workshopMap.clear();
	expansion.getResolvedWorkshopModMap().forEach((mod, workshopID) => workshopMap.set(workshopID, mod));
	return expansion.getPendingWorkshopMods();
});

export const expandPendingWorkshopDependencies = Effect.fnUntraced(function* (
	expansion: WorkshopInventoryExpansion,
	{ adapters, onProgressEffect }: WorkshopInventoryDependencyExpansionOptions
): Effect.fn.Return<number, unknown, SteamPersonaCache> {
	return yield* runDependencyExpansion(expansion, adapters, onProgressEffect);
});

import { Effect } from 'effect';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { WorkshopInventoryExpansion } from './workshop-inventory-expansion-state';
import type { WorkshopDependencyEffect, WorkshopInventoryDependencyExpansionOptions } from './workshop-inventory-types';

export const expandPendingWorkshopDependencies = Effect.fnUntraced(function* (
	expansion: WorkshopInventoryExpansion,
	{ adapters, onProgressEffect }: WorkshopInventoryDependencyExpansionOptions
): Effect.fn.Return<number, unknown, SteamPersonaCache> {
	let effects: WorkshopDependencyEffect[] = expansion.startDependencyExpansion();
	while (effects.length > 0) {
		const effect = effects.shift()!;
		if (effect.type === 'dependency-expansion-complete') return effect.dependencyItems;
		if (effect.type === 'increment-workshop-total') {
			onProgressEffect?.(effect);
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

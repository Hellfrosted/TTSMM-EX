import { Effect } from 'effect';
import type { ModData } from '../model';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { SteamUGCDetails } from './steamworks';
import { applyWorkshopDependencySnapshotResult, ingestWorkshopDependencySnapshotBatch } from './workshop-dependencies';
import type { BuildWorkshopMod, UnresolvedWorkshopItem, WorkshopModBuildOutcome } from './workshop-inventory-types';
import { getUnresolvedWorkshopReason } from './workshop-inventory-unresolved-policy';

export const buildWorkshopModBatch = Effect.fnUntraced(function* (
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: BuildWorkshopMod,
	keepUnknownWorkshopItem: (workshopID: bigint) => boolean = () => false
): Effect.fn.Return<WorkshopModBuildOutcome, unknown, SteamPersonaCache> {
	const dependencySnapshots = yield* ingestWorkshopDependencySnapshotBatch(steamDetails);
	const mods = yield* Effect.forEach(
		steamDetails,
		(steamUGCDetails) =>
			buildWorkshopMod(steamUGCDetails.publishedFileId, steamUGCDetails, keepUnknownWorkshopItem(steamUGCDetails.publishedFileId)).pipe(
				Effect.map((mod) => {
					const dependencySnapshot = dependencySnapshots.get(steamUGCDetails.publishedFileId);
					if (mod && dependencySnapshot) {
						applyWorkshopDependencySnapshotResult(mod, dependencySnapshot);
					}
					return mod;
				}),
				Effect.catch(() => {
					return Effect.succeed<ModData | null>(null);
				})
			),
		{ concurrency: 'unbounded' }
	);
	const unresolvedWorkshopItems = mods.flatMap((mod, index) =>
		mod
			? []
			: [
					{
						workshopID: steamDetails[index].publishedFileId,
						reason: getUnresolvedWorkshopReason(steamDetails[index])
					} satisfies UnresolvedWorkshopItem
				]
	);
	return {
		mods: mods.filter((mod): mod is ModData => !!mod),
		unresolvedWorkshopItems
	};
});

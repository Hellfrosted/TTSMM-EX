import { Effect } from 'effect';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { SteamUGCDetails } from './steamworks';
import { getWorkshopInventorySourceForKnownItem } from './workshop-inventory-source-policy';
import type {
	BuildWorkshopMod,
	WorkshopInventoryResolvedRecord,
	WorkshopInventorySubscribedPage,
	WorkshopInventorySubscribedPageObservation,
	WorkshopInventorySubscribedPageTransition,
	WorkshopModBuildOutcome
} from './workshop-inventory-types';

interface WorkshopInventorySubscribedPageExpansion {
	addResolvedRecords(records: Iterable<WorkshopInventoryResolvedRecord>): void;
	addUnresolvedWorkshopItems(items: Iterable<WorkshopInventorySubscribedPageTransition['unresolvedWorkshopItems'][number]>): void;
}

export function getWorkshopInventoryPageItemIDs(page: WorkshopInventorySubscribedPage) {
	return new Set(page.itemIDs ?? page.items.map((item) => item.publishedFileId));
}

export function createWorkshopInventorySubscribedPageTransition(
	knownWorkshopMods: Set<bigint>,
	observation: WorkshopInventorySubscribedPageObservation
) {
	const resolvedRecords = [...observation.builtPageMods.mods, ...observation.missingDetailMods.mods].flatMap((mod) => {
		if (mod.workshopID === undefined) {
			return [];
		}
		const source = getWorkshopInventorySourceForKnownItem(mod.workshopID, knownWorkshopMods);
		return [{ mod, source }];
	});
	return {
		progressEffect: { type: 'set-workshop-total', total: observation.page.totalItems },
		resolvedRecords,
		subscribedItems: observation.page.numReturned,
		unresolvedWorkshopItems: [
			...observation.builtPageMods.unresolvedWorkshopItems,
			...observation.missingDetailMods.unresolvedWorkshopItems
		]
	} satisfies WorkshopInventorySubscribedPageTransition;
}

export function applyWorkshopInventorySubscribedPageTransition(
	expansion: WorkshopInventorySubscribedPageExpansion,
	transition: WorkshopInventorySubscribedPageTransition
) {
	expansion.addUnresolvedWorkshopItems(transition.unresolvedWorkshopItems);
	expansion.addResolvedRecords(transition.resolvedRecords);
}

export const buildWorkshopModsForMissingDetails = Effect.fnUntraced(function* (
	requestedWorkshopIDs: Set<bigint>,
	details: SteamUGCDetails[],
	buildWorkshopMod: BuildWorkshopMod,
	knownWorkshopMods: Set<bigint>
): Effect.fn.Return<WorkshopModBuildOutcome, unknown, SteamPersonaCache> {
	const detailIDs = new Set(details.map((item) => item.publishedFileId));
	const missingWorkshopIDs = [...requestedWorkshopIDs].filter((workshopID) => !detailIDs.has(workshopID));
	const mods = yield* Effect.forEach(
		missingWorkshopIDs,
		(workshopID) =>
			buildWorkshopMod(workshopID, undefined, knownWorkshopMods.has(workshopID)).pipe(
				Effect.map((mod) => ({ mod, workshopID })),
				Effect.catch(() => Effect.succeed({ mod: null, workshopID }))
			),
		{ concurrency: 'unbounded' }
	);
	return {
		mods: mods.flatMap(({ mod }) => (mod ? [mod] : [])),
		unresolvedWorkshopItems: mods.flatMap(({ mod, workshopID }) => (mod ? [] : [{ workshopID, reason: 'metadata-failed' as const }]))
	};
});

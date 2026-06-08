import { Effect } from 'effect';
import type { SteamPersonaCache } from './steam-persona-cache';
import { expandPendingWorkshopDependencies } from './workshop-dependency-chunk-resolution';
import { buildWorkshopModBatch } from './workshop-inventory-build-policy';
import { WorkshopInventoryExpansion } from './workshop-inventory-expansion-state';
import {
	applyWorkshopInventorySubscribedPageTransition,
	buildWorkshopModsForMissingDetails,
	createWorkshopInventorySubscribedPageTransition,
	getWorkshopInventoryPageItemIDs
} from './workshop-inventory-subscribed-page-policy';
import type { WorkshopInventoryExpansionScanInput, WorkshopInventoryScanOutcome } from './workshop-inventory-types';

export function createEmptyWorkshopInventoryScanOutcome(): WorkshopInventoryScanOutcome {
	return {
		mods: [],
		stats: {
			dependencyItems: 0,
			knownItems: 0,
			subscribedItems: 0
		},
		unresolvedWorkshopItems: []
	};
}

export const scanWorkshopInventoryExpansion = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	fetchSubscribedPage,
	getDetailsForWorkshopModList,
	knownWorkshopMods,
	logDebug,
	onProgressEffect,
	options
}: WorkshopInventoryExpansionScanInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const expansion = new WorkshopInventoryExpansion(explicitKnownWorkshopMods, new Map(), new Set(), options);
	let subscribedItems = 0;

	for (let pageNumber = 1, lastProcessed = 1; lastProcessed > 0; pageNumber += 1) {
		const page = yield* fetchSubscribedPage(pageNumber);
		const requestedWorkshopIDs = getWorkshopInventoryPageItemIDs(page);
		lastProcessed = page.numReturned;
		logDebug?.(`Total items: ${page.totalItems}, Returned by Steam: ${page.numReturned}, Processed this chunk: ${page.items.length}`);

		const builtPageMods = yield* buildWorkshopModBatch(page.items, buildWorkshopMod, (workshopID) =>
			explicitKnownWorkshopMods.has(workshopID)
		);
		const missingDetailMods = yield* buildWorkshopModsForMissingDetails(
			requestedWorkshopIDs,
			page.items,
			buildWorkshopMod,
			explicitKnownWorkshopMods
		);
		const pageTransition = createWorkshopInventorySubscribedPageTransition(explicitKnownWorkshopMods, {
			builtPageMods,
			missingDetailMods,
			page
		});
		applyWorkshopInventorySubscribedPageTransition(expansion, pageTransition);
		onProgressEffect?.(pageTransition.progressEffect);
		subscribedItems += pageTransition.subscribedItems;
	}

	expansion.queueMissingDependenciesFromResolvedMods();
	if (expansion.getResolvedWorkshopModCount() !== subscribedItems) {
		logDebug?.(
			`Steam returned ${subscribedItems} subscribed workshop entries, ` +
				`but loaded ${expansion.getResolvedWorkshopModCount()} valid unique mods. ` +
				'Filtered or duplicate entries are expected to make these counts differ.'
		);
	}

	const dependencyItems = yield* expandPendingWorkshopDependencies(expansion, {
		adapters: {
			getDetailsForWorkshopModList,
			keepUnknownWorkshopItem: () => true,
			knownWorkshopMods: explicitKnownWorkshopMods,
			options
		},
		onProgressEffect
	});

	return expansion.createScanOutcome({
		dependencyItems,
		knownItems: explicitKnownWorkshopMods.size,
		subscribedItems
	});
});

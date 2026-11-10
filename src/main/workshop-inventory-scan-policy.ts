import { Duration, Effect, Option } from 'effect';
import type { SteamPersonaCache } from './steam-persona-cache';
import { expandPendingWorkshopDependencies } from './workshop-dependency-chunk-resolution';
import { WorkshopPagingStalled } from './workshop-errors';
import { buildWorkshopModBatch } from './workshop-inventory-build-policy';
import { WorkshopInventoryExpansion } from './workshop-inventory-expansion-state';
import {
	applyWorkshopInventorySubscribedPageTransition,
	buildWorkshopModsForMissingDetails,
	createWorkshopInventorySubscribedPageTransition,
	getWorkshopInventoryPageItemIDs
} from './workshop-inventory-subscribed-page-policy';
import type { WorkshopInventoryExpansionScanInput, WorkshopInventoryScanOutcome } from './workshop-inventory-types';

const DEFAULT_MAX_WORKSHOP_PAGES = 10_000;
const DEFAULT_WORKSHOP_PAGE_TIMEOUT = Duration.seconds(30);

function recordPageProgress(
	pageNumber: number,
	numReturned: number,
	ids: Set<bigint>,
	progress: { seen: Set<bigint>; repeatedPages: number }
): WorkshopPagingStalled | undefined {
	const hasNewIDs = [...ids].some((id) => !progress.seen.has(id));
	for (const id of ids) progress.seen.add(id);
	progress.repeatedPages = numReturned > 0 && !hasNewIDs ? progress.repeatedPages + 1 : 0;
	return progress.repeatedPages >= 2 ? new WorkshopPagingStalled(pageNumber, 'no-progress') : undefined;
}

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
	options,
	paging
}: WorkshopInventoryExpansionScanInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const expansion = new WorkshopInventoryExpansion(explicitKnownWorkshopMods, new Map(), new Set(), options);
	const maxPages = paging?.maxPages ?? DEFAULT_MAX_WORKSHOP_PAGES;
	const pageTimeout = paging?.pageTimeout ?? DEFAULT_WORKSHOP_PAGE_TIMEOUT;
	const pageProgress = { seen: new Set<bigint>(), repeatedPages: 0 };
	let subscribedItems = 0;

	for (let pageNumber = 1; ; pageNumber += 1) {
		if (pageNumber > maxPages) {
			return yield* Effect.fail(new WorkshopPagingStalled(pageNumber, 'page-limit'));
		}

		const pageOption = yield* fetchSubscribedPage(pageNumber).pipe(Effect.timeoutOption(pageTimeout));
		if (Option.isNone(pageOption)) {
			return yield* Effect.fail(new WorkshopPagingStalled(pageNumber, 'timeout'));
		}
		const page = pageOption.value;
		const requestedWorkshopIDs = getWorkshopInventoryPageItemIDs(page);
		const stall = recordPageProgress(pageNumber, page.numReturned, requestedWorkshopIDs, pageProgress);
		if (stall) return yield* Effect.fail(stall);
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

		if (page.numReturned <= 0) {
			break;
		}
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
			knownWorkshopMods: explicitKnownWorkshopMods
		},
		onProgressEffect
	});

	return expansion.createScanOutcome({
		dependencyItems,
		knownItems: explicitKnownWorkshopMods.size,
		subscribedItems
	});
});

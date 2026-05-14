import { Effect } from 'effect';
import log from 'electron-log';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { toEffectOperationError } from '../shared/effect-errors';
import type { ModInventoryProgress } from './mod-inventory-progress';
import { getWorkshopDetailsMap } from './mod-workshop-metadata';
import { getSteamSubscribedPage, shouldSkipWorkshopFetch } from './mod-workshop-paging';
import type { SteamPersonaCache } from './steam-persona-cache';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import {
	buildWorkshopModBatch,
	createEmptyWorkshopInventoryScanOutcome,
	scanWorkshopInventoryExpansion,
	type WorkshopInventoryProgressEffect,
	type WorkshopInventoryScanOutcome
} from './workshop-inventory-expansion';

export {
	buildWorkshopModBatch,
	resolveWorkshopDependencyChunk,
	type UnresolvedWorkshopItem,
	type UnresolvedWorkshopReason,
	type WorkshopInventoryScanOutcome
} from './workshop-inventory-expansion';

interface LinuxWorkshopInventoryInput {
	buildWorkshopMod: (
		workshopID: bigint,
		steamUGCDetails?: SteamUGCDetails,
		keepUnknownWorkshopItem?: boolean
	) => Effect.Effect<ModData | null, unknown, SteamPersonaCache>;
	getDetailsForWorkshopModList: (
		workshopIDs: bigint[],
		keepUnknownWorkshopItem?: (workshopID: bigint) => boolean
	) => Effect.Effect<ModData[], unknown, SteamPersonaCache>;
	knownWorkshopMods: Set<bigint>;
	options?: NuterraSteamCompatibilityOptions;
	progress: ModInventoryProgress;
}

interface WorkshopInventoryInput extends LinuxWorkshopInventoryInput {
	platform: NodeJS.Platform;
}

function applyWorkshopInventoryProgressEffect(progress: ModInventoryProgress, effect: WorkshopInventoryProgressEffect) {
	switch (effect.type) {
		case 'set-workshop-total':
			progress.workshopMods = effect.total;
			break;
		case 'increment-workshop-total':
			progress.workshopMods += effect.count;
			break;
		case 'increment-loaded-mods':
			progress.addLoaded(effect.count);
			break;
	}
}

const scanLinuxWorkshopInventory = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	getDetailsForWorkshopModList,
	knownWorkshopMods,
	options,
	progress
}: LinuxWorkshopInventoryInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	const allSubscribedItems = yield* Effect.try({
		try: () => Steamworks.getSubscribedItems(),
		catch: (error) => toEffectOperationError('read subscribed Workshop items', error)
	});
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const workshopIDs = new Set<bigint>([...allSubscribedItems, ...explicitKnownWorkshopMods]);

	log.debug(`All subscribed items: [${allSubscribedItems}]`);
	const workshopDetailsMap = yield* getWorkshopDetailsMap(workshopIDs);

	return yield* scanWorkshopInventoryExpansion({
		buildWorkshopMod,
		fetchSubscribedPage: (page) =>
			Effect.succeed({
				items: page === 1 ? [...workshopDetailsMap.values()] : [],
				itemIDs: page === 1 ? workshopIDs : [],
				numReturned: page === 1 ? allSubscribedItems.length : 0,
				totalItems: workshopIDs.size
			}),
		getDetailsForWorkshopModList,
		knownWorkshopMods,
		logDebug: (message) => log.debug(message),
		onProgressEffect: (effect) => applyWorkshopInventoryProgressEffect(progress, effect),
		options
	});
});

export const buildWorkshopMods = Effect.fnUntraced(function* (
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: LinuxWorkshopInventoryInput['buildWorkshopMod'],
	keepUnknownWorkshopItem: (workshopID: bigint) => boolean = () => false
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	const outcome = yield* buildWorkshopModBatch(steamDetails, buildWorkshopMod, keepUnknownWorkshopItem);
	return outcome.mods;
});

export const scanWorkshopInventory = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	getDetailsForWorkshopModList,
	knownWorkshopMods,
	options,
	platform,
	progress
}: WorkshopInventoryInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	if (shouldSkipWorkshopFetch(platform)) {
		return createEmptyWorkshopInventoryScanOutcome();
	}

	if (platform === 'linux') {
		return yield* scanLinuxWorkshopInventory({
			buildWorkshopMod,
			getDetailsForWorkshopModList,
			knownWorkshopMods,
			options,
			progress
		});
	}

	if (log.transports.file.level === 'debug' || log.transports.file.level === 'silly') {
		const allSubscribedItems = yield* Effect.try({
			try: () => Steamworks.getSubscribedItems(),
			catch: (error) => toEffectOperationError('read subscribed Workshop items for debug logging', error)
		}).pipe(
			Effect.catch((error) => {
				log.debug('Failed to read subscribed Workshop items for debug logging.');
				log.debug(error);
				return Effect.succeed<bigint[]>([]);
			})
		);
		log.debug(`All subscribed items: [${allSubscribedItems}]`);
	}

	return yield* scanWorkshopInventoryExpansion({
		buildWorkshopMod,
		fetchSubscribedPage: getSteamSubscribedPage,
		getDetailsForWorkshopModList,
		knownWorkshopMods,
		logDebug: (message) => log.debug(message),
		onProgressEffect: (effect) => applyWorkshopInventoryProgressEffect(progress, effect),
		options
	});
});

export const fetchWorkshopInventory = Effect.fnUntraced(function* (
	input: WorkshopInventoryInput
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	const outcome = yield* scanWorkshopInventory(input);
	return outcome.mods;
});

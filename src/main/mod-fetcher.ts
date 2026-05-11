import { Effect } from 'effect';
import log from 'electron-log';
import { ModData, type NuterraSteamCompatibilityOptions } from '../model';
import { ModInventoryProgress } from './mod-inventory-progress';
import { scanLocalMods } from './mod-local-scan';
import { hydrateWorkshopMod } from './mod-workshop-hydration';
import { buildWorkshopMods, fetchWorkshopInventory } from './mod-workshop-inventory';
import { getRawWorkshopDetailsForList } from './mod-workshop-metadata';
import { clearPreviewAllowlist } from './preview-protocol';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { SteamUGCDetails } from './steamworks';

export { getModDetailsFromPath } from './mod-local-scan';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

interface ModFetcherOptions {
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

interface ModInventoryContext {
	localPath?: string;
	knownWorkshopMods: Set<bigint>;
	platform: NodeJS.Platform;
	progress: ModInventoryProgress;
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

export function createModInventoryContext(
	progressSender: ProgressSender,
	localPath: string | undefined,
	knownWorkshopMods: bigint[],
	platform: NodeJS.Platform = process.platform,
	options: ModFetcherOptions = {}
): ModInventoryContext {
	return {
		localPath,
		knownWorkshopMods: new Set(knownWorkshopMods),
		platform,
		progress: new ModInventoryProgress(progressSender),
		treatNuterraSteamBetaAsEquivalent: options.treatNuterraSteamBetaAsEquivalent
	};
}

function updateModLoadingProgress(context: ModInventoryContext, size: number) {
	context.progress.addLoaded(size);
}

function fetchLocalMods(context: ModInventoryContext): Effect.Effect<ModData[], unknown> {
	return scanLocalMods(context.localPath, context.progress);
}

function getNuterraSteamCompatibilityOptions(context: ModInventoryContext): NuterraSteamCompatibilityOptions {
	return {
		treatNuterraSteamBetaAsEquivalent: context.treatNuterraSteamBetaAsEquivalent
	};
}

export const buildWorkshopMod = Effect.fnUntraced(function* (
	context: ModInventoryContext,
	workshopID: bigint,
	steamUGCDetails?: SteamUGCDetails,
	keepUnknownWorkshopItem = false
): Effect.fn.Return<ModData | null, unknown, SteamPersonaCache> {
	return yield* hydrateWorkshopMod({
		keepUnknownWorkshopItem,
		onProgress: (size) => updateModLoadingProgress(context, size),
		steamUGCDetails,
		workshopID
	});
});

export const processSteamModResults = Effect.fnUntraced(function* (
	context: ModInventoryContext,
	steamDetails: SteamUGCDetails[]
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	return yield* buildWorkshopMods(steamDetails, (workshopID, steamUGCDetails, keepUnknownWorkshopItem) =>
		buildWorkshopMod(context, workshopID, steamUGCDetails, keepUnknownWorkshopItem)
	);
});

const getDetailsForWorkshopModList = Effect.fnUntraced(function* (
	context: ModInventoryContext,
	workshopIDs: bigint[]
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	const steamDetails = yield* getRawWorkshopDetailsForList(workshopIDs);
	return yield* processSteamModResults(context, steamDetails);
});

export function fetchWorkshopMods(context: ModInventoryContext): Effect.Effect<ModData[], unknown, SteamPersonaCache> {
	return fetchWorkshopInventory({
		buildWorkshopMod: (workshopID, steamUGCDetails, keepUnknownWorkshopItem) =>
			buildWorkshopMod(context, workshopID, steamUGCDetails, keepUnknownWorkshopItem),
		getDetailsForWorkshopModList: (workshopIDs) => getDetailsForWorkshopModList(context, workshopIDs),
		knownWorkshopMods: context.knownWorkshopMods,
		options: getNuterraSteamCompatibilityOptions(context),
		platform: context.platform,
		progress: context.progress,
		updateModLoadingProgress: (size) => updateModLoadingProgress(context, size)
	});
}

export const fetchModInventory = Effect.fnUntraced(function* (
	context: ModInventoryContext
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	clearPreviewAllowlist();

	const modResponses = yield* Effect.forEach(
		[fetchLocalMods(context), fetchWorkshopMods(context)],
		(effect) =>
			effect.pipe(
				Effect.catch((error) => {
					log.error('Failed to process some mod data:');
					log.error(error);
					return Effect.succeed<ModData[]>([]);
				})
			),
		{ concurrency: 'unbounded' }
	);
	const allMods: ModData[] = modResponses.flat();

	context.progress.finish();
	return allMods;
});

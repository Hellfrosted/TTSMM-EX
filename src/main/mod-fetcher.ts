import { ModData, type NuterraSteamCompatibilityOptions } from '../model';

import type { SteamUGCDetails } from './steamworks';
import { clearPreviewAllowlist } from './preview-protocol';
import { ModInventoryProgress } from './mod-inventory-progress';
import { scanLocalMods } from './mod-local-scan';
import { getRawWorkshopDetailsForList } from './mod-workshop-metadata';
import { hydrateWorkshopMod } from './mod-workshop-hydration';
import { fetchWorkshopInventory, filterSettledModResults } from './mod-workshop-inventory';
import { applyWorkshopDependencySnapshotResult, ingestWorkshopDependencySnapshotBatch } from './workshop-dependencies';

export { getModDetailsFromPath } from './mod-local-scan';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

export interface ModFetcherOptions {
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

export interface ModInventoryContext {
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

function fetchLocalMods(context: ModInventoryContext): Promise<ModData[]> {
	return scanLocalMods(context.localPath, context.progress);
}

function getNuterraSteamCompatibilityOptions(context: ModInventoryContext): NuterraSteamCompatibilityOptions {
	return {
		treatNuterraSteamBetaAsEquivalent: context.treatNuterraSteamBetaAsEquivalent
	};
}

export async function buildWorkshopMod(
	context: ModInventoryContext,
	workshopID: bigint,
	steamUGCDetails?: SteamUGCDetails,
	keepUnknownWorkshopItem = false
): Promise<ModData | null> {
	return hydrateWorkshopMod({
		keepUnknownWorkshopItem,
		onProgress: (size) => updateModLoadingProgress(context, size),
		steamUGCDetails,
		workshopID
	});
}

export async function processSteamModResults(context: ModInventoryContext, steamDetails: SteamUGCDetails[]): Promise<ModData[]> {
	const dependencySnapshots = await ingestWorkshopDependencySnapshotBatch(steamDetails);
	const modResponses = await Promise.allSettled<ModData | null>(
		steamDetails.map(async (steamUGCDetails: SteamUGCDetails) => {
			const mod = await buildWorkshopMod(context, steamUGCDetails.publishedFileId, steamUGCDetails);
			const dependencySnapshot = dependencySnapshots.get(steamUGCDetails.publishedFileId);
			if (mod && dependencySnapshot) {
				applyWorkshopDependencySnapshotResult(mod, dependencySnapshot);
			}
			return mod;
		})
	);
	return filterSettledModResults(modResponses);
}

export async function getDetailsForWorkshopModList(context: ModInventoryContext, workshopIDs: bigint[]): Promise<ModData[]> {
	const steamDetails = await getRawWorkshopDetailsForList(workshopIDs);
	return processSteamModResults(context, steamDetails);
}

export function fetchWorkshopMods(context: ModInventoryContext): Promise<ModData[]> {
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

export async function fetchModInventory(context: ModInventoryContext): Promise<ModData[]> {
	clearPreviewAllowlist();

	const modResponses = await Promise.allSettled<ModData[]>([fetchLocalMods(context), fetchWorkshopMods(context)]);
	const allMods: ModData[] = filterSettledModResults(modResponses).flat();

	context.progress.finish();
	return allMods;
}

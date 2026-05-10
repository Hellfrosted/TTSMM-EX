import { ModData, type NuterraSteamCompatibilityOptions } from '../model';

import type { SteamUGCDetails } from './steamworks';
import { clearPreviewAllowlist } from './preview-protocol';
import { isSteamworksBypassEnabled } from './steamworks-runtime';
import { ModInventoryProgress } from './mod-inventory-progress';
import { scanLocalMods } from './mod-local-scan';
import { getRawWorkshopDetailsForList } from './mod-workshop-metadata';
import { hydrateWorkshopMod } from './mod-workshop-hydration';
import { fetchWorkshopInventory, filterSettledModResults } from './mod-workshop-inventory';
import { fetchWorkshopDependencyLookup } from './workshop-dependencies';

export { getModDetailsFromPath } from './mod-local-scan';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

interface ModFetcherOptions {
	skipWorkshopSteamworks?: boolean;
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

interface ModInventoryContext {
	localPath?: string;
	knownWorkshopMods: Set<bigint>;
	platform: NodeJS.Platform;
	progress: ModInventoryProgress;
	skipWorkshopSteamworks: boolean;
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
		skipWorkshopSteamworks: options.skipWorkshopSteamworks ?? isSteamworksBypassEnabled(),
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

async function buildWorkshopMod(
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

async function processSteamModResults(context: ModInventoryContext, steamDetails: SteamUGCDetails[]): Promise<ModData[]> {
	const modResponses = await Promise.allSettled<ModData | null>(
		steamDetails.map((steamUGCDetails: SteamUGCDetails) => buildWorkshopMod(context, steamUGCDetails.publishedFileId, steamUGCDetails))
	);
	return filterSettledModResults(modResponses);
}

async function getDetailsForWorkshopModList(context: ModInventoryContext, workshopIDs: bigint[]): Promise<ModData[]> {
	const steamDetails = await getRawWorkshopDetailsForList(workshopIDs);
	return processSteamModResults(context, steamDetails);
}

function fetchWorkshopMods(context: ModInventoryContext): Promise<ModData[]> {
	return fetchWorkshopInventory({
		buildWorkshopMod: (workshopID, steamUGCDetails, keepUnknownWorkshopItem) =>
			buildWorkshopMod(context, workshopID, steamUGCDetails, keepUnknownWorkshopItem),
		getDetailsForWorkshopModList: (workshopIDs) => getDetailsForWorkshopModList(context, workshopIDs),
		knownWorkshopMods: context.knownWorkshopMods,
		options: getNuterraSteamCompatibilityOptions(context),
		platform: context.platform,
		progress: context.progress,
		refreshWorkshopDependencies: fetchWorkshopDependencyLookup,
		skipWorkshopSteamworks: context.skipWorkshopSteamworks,
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

export default class ModFetcher {
	localPath?: string;

	knownWorkshopMods: Set<bigint>;

	progressSender: ProgressSender;

	platform: NodeJS.Platform;

	skipWorkshopSteamworks: boolean;

	treatNuterraSteamBetaAsEquivalent?: boolean;

	progress: ModInventoryProgress;

	constructor(
		progressSender: ProgressSender,
		localPath: string | undefined,
		knownWorkshopMods: bigint[],
		platform: NodeJS.Platform = process.platform,
		options: ModFetcherOptions = {}
	) {
		const context = createModInventoryContext(progressSender, localPath, knownWorkshopMods, platform, options);
		this.localPath = context.localPath;
		this.knownWorkshopMods = context.knownWorkshopMods;
		this.progressSender = progressSender;
		this.platform = context.platform;
		this.skipWorkshopSteamworks = context.skipWorkshopSteamworks;
		this.treatNuterraSteamBetaAsEquivalent = context.treatNuterraSteamBetaAsEquivalent;
		this.progress = context.progress;
	}

	private createContext(): ModInventoryContext {
		return {
			localPath: this.localPath,
			knownWorkshopMods: this.knownWorkshopMods,
			platform: this.platform,
			progress: this.progress,
			skipWorkshopSteamworks: this.skipWorkshopSteamworks,
			treatNuterraSteamBetaAsEquivalent: this.treatNuterraSteamBetaAsEquivalent
		};
	}

	updateModLoadingProgress(size: number) {
		updateModLoadingProgress(this.createContext(), size);
	}

	async fetchLocalMods(): Promise<ModData[]> {
		return fetchLocalMods(this.createContext());
	}

	async getDetailsForWorkshopModList(workshopIDs: bigint[]): Promise<ModData[]> {
		const steamDetails = await getRawWorkshopDetailsForList(workshopIDs);
		return this.processSteamModResults(steamDetails);
	}

	async buildWorkshopMod(workshopID: bigint, steamUGCDetails?: SteamUGCDetails, keepUnknownWorkshopItem = false): Promise<ModData | null> {
		return buildWorkshopMod(this.createContext(), workshopID, steamUGCDetails, keepUnknownWorkshopItem);
	}

	async processSteamModResults(steamDetails: SteamUGCDetails[]): Promise<ModData[]> {
		const modResponses = await Promise.allSettled<ModData | null>(
			steamDetails.map((steamUGCDetails: SteamUGCDetails) => this.buildWorkshopMod(steamUGCDetails.publishedFileId, steamUGCDetails))
		);
		return filterSettledModResults(modResponses);
	}

	async fetchWorkshopMods(): Promise<ModData[]> {
		return fetchWorkshopInventory({
			buildWorkshopMod: (workshopID, steamUGCDetails, keepUnknownWorkshopItem) =>
				this.buildWorkshopMod(workshopID, steamUGCDetails, keepUnknownWorkshopItem),
			getDetailsForWorkshopModList: (workshopIDs) => this.getDetailsForWorkshopModList(workshopIDs),
			knownWorkshopMods: this.knownWorkshopMods,
			options: getNuterraSteamCompatibilityOptions(this.createContext()),
			platform: this.platform,
			progress: this.progress,
			refreshWorkshopDependencies: fetchWorkshopDependencyLookup,
			skipWorkshopSteamworks: this.skipWorkshopSteamworks,
			updateModLoadingProgress: (size) => this.updateModLoadingProgress(size)
		});
	}

	async fetchMods(): Promise<ModData[]> {
		clearPreviewAllowlist();

		const modResponses = await Promise.allSettled<ModData[]>([this.fetchLocalMods(), this.fetchWorkshopMods()]);
		const allMods: ModData[] = filterSettledModResults(modResponses).flat();

		this.progress.finish();
		return allMods;
	}
}

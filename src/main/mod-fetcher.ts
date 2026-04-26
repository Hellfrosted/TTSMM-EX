import log from 'electron-log';
import fs from 'fs';

import { ModData, ModType } from '../model';
import { isSuccessful } from '../util/Promise';

import Steamworks, {
	GetUserItemsProps,
	SteamPageResults,
	SteamUGCDetails,
	UGCItemState,
	UGCMatchingType,
	UserUGCList,
	UserUGCListSortOrder
} from './steamworks';
import { clearPreviewAllowlist } from './preview-protocol';
import { isSteamworksBypassEnabled } from './steamworks-runtime';
import { ModInventoryProgress } from './mod-inventory-progress';
import { getModDetailsFromPath, scanLocalMods } from './mod-local-scan';
import {
	chunkWorkshopIds,
	createWorkshopPotentialMod,
	getRawWorkshopDetailsForList,
	getWorkshopDetailsMap,
	hasWorkshopModTag,
	populateWorkshopModMetadata
} from './mod-workshop-metadata';

export { getModDetailsFromPath } from './mod-local-scan';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

interface ModFetcherOptions {
	skipWorkshopSteamworks?: boolean;
}

function filterOutNullValues<T>(responses: PromiseSettledResult<T | null>[]): T[] {
	return responses
		.filter((result: PromiseSettledResult<T | null>) => {
			const success = isSuccessful(result);
			if (!success) {
				log.error('Failed to process some mod data:');
				log.error(result.reason);
				return false;
			}
			return !!result.value;
		})
		.map((result) => {
			const settledResult = result as PromiseFulfilledResult<T>;
			const { value } = settledResult;
			return value;
		});
}

const TERRATECH_APP_ID = 285920;

function shouldSkipWorkshopFetch(platform: NodeJS.Platform, existsSync: typeof fs.existsSync = fs.existsSync): boolean {
	if (platform !== 'linux') {
		return false;
	}

	try {
		const installDir = Steamworks.getAppInstallDir(TERRATECH_APP_ID);
		if (Steamworks.isAppInstalled(TERRATECH_APP_ID) && installDir && existsSync(installDir)) {
			return false;
		}

		log.warn(
			`Skipping Linux workshop scan because TerraTech is not installed in the Linux Steam library. installDir=${installDir || '<missing>'}`
		);
		return true;
	} catch (error) {
		log.error('Failed to verify the Linux TerraTech installation before scanning workshop items.');
		log.error(error);
		return true;
	}
}

async function getSteamSubscribedPage(pageNum: number): Promise<SteamPageResults> {
	return new Promise((resolve, reject) => {
		const options: GetUserItemsProps = {
			options: {
				app_id: 285920,
				page_num: pageNum,
				required_tag: 'Mods'
			},
			ugc_matching_type: UGCMatchingType.ItemsReadyToUse,
			ugc_list: UserUGCList.Subscribed,
			ugc_list_sort_order: UserUGCListSortOrder.SubscriptionDateDesc,
			success_callback: (results: SteamPageResults) => {
				resolve(results);
			},
			error_callback: (err: Error) => {
				reject(err);
			}
		};
		Steamworks.ugcGetUserItems(options);
	});
}

export default class ModFetcher {
	localPath?: string;

	knownWorkshopMods: Set<bigint>;

	progressSender: ProgressSender;

	platform: NodeJS.Platform;

	skipWorkshopSteamworks: boolean;

	progress: ModInventoryProgress;

	constructor(
		progressSender: ProgressSender,
		localPath: string | undefined,
		knownWorkshopMods: bigint[],
		platform: NodeJS.Platform = process.platform,
		options: ModFetcherOptions = {}
	) {
		this.localPath = localPath;
		this.knownWorkshopMods = new Set();
		this.progressSender = progressSender;
		this.platform = platform;
		this.skipWorkshopSteamworks = options.skipWorkshopSteamworks ?? isSteamworksBypassEnabled();

		this.progress = new ModInventoryProgress(progressSender);

		knownWorkshopMods.forEach((workshopid) => this.knownWorkshopMods.add(workshopid));
	}

	updateModLoadingProgress(size: number) {
		this.progress.addLoaded(size);
	}

	async fetchLocalMods(): Promise<ModData[]> {
		return scanLocalMods(this.localPath, this.progress);
	}

	async getDetailsForWorkshopModList(workshopIDs: bigint[]): Promise<ModData[]> {
		const steamDetails = await getRawWorkshopDetailsForList(workshopIDs);
		return this.processSteamModResults(steamDetails);
	}

	async buildWorkshopMod(workshopID: bigint, steamUGCDetails?: SteamUGCDetails, keepUnknownWorkshopItem = false): Promise<ModData | null> {
		const potentialMod = createWorkshopPotentialMod(workshopID);
		await populateWorkshopModMetadata(potentialMod, steamUGCDetails);

		try {
			const state: UGCItemState = Steamworks.ugcGetItemState(workshopID);
			if (state) {
				potentialMod.subscribed = !!(state & UGCItemState.Subscribed);
				potentialMod.installed = !!(state & UGCItemState.Installed);
				potentialMod.downloadPending = !!(state & UGCItemState.DownloadPending);
				potentialMod.downloading = !!(state & UGCItemState.Downloading);
				potentialMod.needsUpdate = !!(state & UGCItemState.NeedsUpdate);
			}
		} catch (error) {
			log.warn(`Failed to read workshop item state for ${workshopID}`);
			log.warn(error);
		}

		const installInfo = Steamworks.ugcGetItemInstallInfo(workshopID);
		if (installInfo) {
			log.silly(`Workshop mod is installed at path: ${installInfo.folder}`);
			potentialMod.lastUpdate = new Date(installInfo.timestamp * 1000);
			potentialMod.size = parseInt(installInfo.sizeOnDisk, 10);
			potentialMod.path = installInfo.folder;
			if (potentialMod.lastWorkshopUpdate) {
				potentialMod.needsUpdate = potentialMod.needsUpdate || potentialMod.lastWorkshopUpdate > potentialMod.lastUpdate;
			}

			try {
				const resolvedMod = await getModDetailsFromPath(potentialMod, installInfo.folder, ModType.WORKSHOP);
				if (resolvedMod) {
					log.silly(JSON.stringify(resolvedMod, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
					return resolvedMod;
				}
			} catch (error) {
				log.error(`Error parsing mod info for workshop:${workshopID}`);
				log.error(error);
			} finally {
				this.updateModLoadingProgress(1);
			}

			if (keepUnknownWorkshopItem) {
				return potentialMod;
			}

			log.warn(`${potentialMod.workshopID} is NOT a valid mod`);
			return null;
		}

		this.updateModLoadingProgress(1);

		const validMod = !!steamUGCDetails && steamUGCDetails.steamIDOwner !== '0' && hasWorkshopModTag(potentialMod.tags);
		if (validMod || keepUnknownWorkshopItem) {
			log.silly(JSON.stringify(potentialMod, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
			return potentialMod;
		}

		log.warn(`${potentialMod.workshopID} is NOT a valid mod`);
		return null;
	}

	async processWorkshopModList(
		workshopMap: Map<bigint, ModData>,
		knownInvalidMods: Set<bigint>,
		modList: Set<bigint>
	): Promise<Set<bigint>> {
		const modChunks = chunkWorkshopIds([...modList]);
		log.silly(JSON.stringify(modChunks, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

		const modDependencies: Set<bigint> = new Set();

		for (let i = 0; i < modChunks.length; i++) {
			try {
				log.silly(`Processing known mod chunk: ${JSON.stringify(modChunks[i], (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);

				const modDetails = await this.getDetailsForWorkshopModList(modChunks[i]);
				log.silly(`Got mod details: ${JSON.stringify(modDetails, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);
				modDetails.forEach((mod: ModData) => {
					log.silly(`Got results for workshop mod ${mod.name} (${mod.uid})`);
					const modid = mod.workshopID!;
					this.knownWorkshopMods.delete(modid);
					knownInvalidMods.delete(modid);
					workshopMap.set(modid!, mod);
				});

				// After this round has been added to the mod map, check if any items are missing
				modDetails.forEach((mod: ModData) => {
					if (mod.steamDependencies) {
						mod.steamDependencies
							.filter((dependency) => !workshopMap.has(dependency) && !knownInvalidMods.has(dependency))
							.forEach((missingDependency) => modDependencies.add(missingDependency));
					}
				});
			} catch (e) {
				log.error(e instanceof Error ? e : 'Error processing chunk');
				this.updateModLoadingProgress(modChunks[i].length);
			}
		}

		return modDependencies;
	}

	async processSteamModResults(steamDetails: SteamUGCDetails[]): Promise<ModData[]> {
		const modResponses = await Promise.allSettled<ModData | null>(
			steamDetails.map((steamUGCDetails: SteamUGCDetails) => this.buildWorkshopMod(steamUGCDetails.publishedFileId, steamUGCDetails))
		);
		return filterOutNullValues(modResponses);
	}

	async fetchWorkshopMods(): Promise<ModData[]> {
		if (this.skipWorkshopSteamworks) {
			log.warn('Skipping Steam Workshop scan because Steamworks is bypassed for this run.');
			return [];
		}

		if (shouldSkipWorkshopFetch(this.platform)) {
			return [];
		}

		if (this.platform === 'linux') {
			return this.fetchWorkshopModsFromSubscriptions();
		}

		let numProcessedWorkshop = 0;
		let pageNum = 1;
		let lastProcessed = 1;
		const workshopMap: Map<bigint, ModData> = new Map();

		if (log.transports.file.level === 'debug' || log.transports.file.level === 'silly') {
			const allSubscribedItems: bigint[] = Steamworks.getSubscribedItems();
			log.debug(`All subscribed items: [${allSubscribedItems}]`);
		}

		// We make 2 assumptions:
		//	1. We are done if and only if reading a page returns 0 results
		//	2. The subscription list will not change mid-pull

		while (lastProcessed > 0) {
			const { items, totalItems, numReturned } = await getSteamSubscribedPage(pageNum);
			this.progress.workshopMods = totalItems;
			numProcessedWorkshop += numReturned;
			lastProcessed = numReturned;
			log.debug(`Total items: ${totalItems}, Returned by Steam: ${numReturned}, Processed this chunk: ${items.length}`);

			const data: ModData[] = await this.processSteamModResults(items);
			data.forEach((modData) => {
				const workshopID: bigint = modData.workshopID!;
				workshopMap.set(workshopID, modData);
				this.knownWorkshopMods.delete(workshopID);
			});
			pageNum += 1;
		}
		// After this round has been added to the mod map, check if any items are missing
		[...workshopMap.values()].forEach((modData: ModData) => {
			if (modData.steamDependencies) {
				modData.steamDependencies
					.filter((dependency) => !workshopMap.has(dependency))
					.forEach((missingDependency) => this.knownWorkshopMods.add(missingDependency));
			}
		});

		if (workshopMap.size !== numProcessedWorkshop) {
			log.debug(
				`Steam returned ${numProcessedWorkshop} subscribed workshop entries, ` +
					`but loaded ${workshopMap.size} valid unique mods. ` +
					'Filtered or duplicate entries are expected to make these counts differ.'
			);
		}

		// We've processed all subscribed workshop mods. Now process the known mods
		const knownInvalidMods: Set<bigint> = new Set();

		let missingKnownWorkshopMods = new Set(this.knownWorkshopMods);

		// continue to query steam until all dependencies are met via BFS search
		while (this.knownWorkshopMods.size > 0) {
			this.progress.workshopMods += missingKnownWorkshopMods.size;

			missingKnownWorkshopMods = await this.processWorkshopModList(workshopMap, knownInvalidMods, missingKnownWorkshopMods);
			this.knownWorkshopMods.forEach((workshopID) => {
				log.error(`Known workshop mod ${workshopID} is invalid`);
				knownInvalidMods.add(workshopID);
			});
			this.knownWorkshopMods.clear();
			this.knownWorkshopMods = new Set(missingKnownWorkshopMods);
		}

		return [...workshopMap.values()];
	}

	private async fetchWorkshopModsFromSubscriptions(): Promise<ModData[]> {
		const allSubscribedItems = Steamworks.getSubscribedItems();
		const knownWorkshopMods = new Set(this.knownWorkshopMods);
		const workshopIDs = new Set<bigint>([...allSubscribedItems, ...knownWorkshopMods]);

		log.debug(`All subscribed items: [${allSubscribedItems}]`);
		this.progress.workshopMods = workshopIDs.size;
		const workshopDetailsMap = await getWorkshopDetailsMap(workshopIDs);

		const modResponses = await Promise.allSettled<ModData | null>(
			[...workshopIDs].map((workshopID) => {
				return this.buildWorkshopMod(workshopID, workshopDetailsMap.get(workshopID), knownWorkshopMods.has(workshopID));
			})
		);
		return filterOutNullValues(modResponses);
	}

	async fetchMods(): Promise<ModData[]> {
		clearPreviewAllowlist();

		const modResponses = await Promise.allSettled<ModData[]>([this.fetchLocalMods(), this.fetchWorkshopMods()]);
		const allMods: ModData[] = filterOutNullValues(modResponses).flat();

		// We are done
		this.progress.finish(); // Return a value > 1.0 to signal we are done
		return allMods;
	}
}

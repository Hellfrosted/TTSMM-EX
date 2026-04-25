import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { Mutex } from 'async-mutex';

import { ModData, ModType, ProgressTypes, ValidChannel } from '../model';
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
import { clearPreviewAllowlist, registerPreviewImage } from './preview-protocol';
import { resolvePersonaName } from './steam-persona-cache';
import { isSteamworksBypassEnabled } from './steamworks-runtime';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

interface ModFetcherOptions {
	skipWorkshopSteamworks?: boolean;
}

function chunk<Type>(arr: Type[], size: number): Type[][] {
	return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
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

const MAX_MODS_PER_PAGE = 50;
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

		log.warn(`Skipping Linux workshop scan because TerraTech is not installed in the Linux Steam library. installDir=${installDir || '<missing>'}`);
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

async function getRawWorkshopDetailsForList(workshopIDs: bigint[]): Promise<SteamUGCDetails[]> {
	return new Promise((resolve, reject) => {
		Steamworks.getUGCDetails(
			workshopIDs.map((workshopID) => workshopID.toString()),
			(steamDetails: SteamUGCDetails[]) => {
				log.silly(`Raw workshop list results: ${JSON.stringify(steamDetails, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}`);
				resolve(steamDetails);
			},
			(err: Error) => {
				log.error(`Failed to fetch mod details for workshop mods ${workshopIDs}`);
				log.error(err);
				reject(err);
			}
		);
	});
}

function createWorkshopPotentialMod(workshopID: bigint): ModData {
	return {
		uid: `${ModType.WORKSHOP}:${workshopID}`,
		id: null,
		type: ModType.WORKSHOP,
		workshopID,
		hasCode: false,
		path: '',
		name: `Workshop item ${workshopID.toString()}`
	};
}

function isWorkshopPlaceholderName(name: string | undefined): boolean {
	return !!name && /^Workshop item \d+$/i.test(name.trim());
}

function hasWorkshopModTag(tags: string[] | undefined): boolean {
	return !!tags?.some((tag) => tag.toLowerCase() === 'mods');
}

function toOptionalStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
	return filtered.length > 0 ? filtered : undefined;
}

function applyTtsmmMetadata(potentialMod: ModData, metadata: unknown) {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return;
	}

	const parsedMetadata = metadata as Record<string, unknown>;
	if (typeof parsedMetadata.name === 'string' && parsedMetadata.name.trim().length > 0 && (!potentialMod.name || isWorkshopPlaceholderName(potentialMod.name))) {
		potentialMod.name = parsedMetadata.name;
	}
	if (typeof parsedMetadata.description === 'string' && !potentialMod.description) {
		potentialMod.description = parsedMetadata.description;
	}

	const authors = toOptionalStringArray(parsedMetadata.authors);
	if (authors && (!potentialMod.authors || potentialMod.authors.length === 0)) {
		potentialMod.authors = authors;
	}

	const tags = toOptionalStringArray(parsedMetadata.tags);
	if (tags && (!potentialMod.tags || potentialMod.tags.length === 0)) {
		potentialMod.tags = tags;
	}

	const explicitIDDependencies = toOptionalStringArray(parsedMetadata.explicitIDDependencies);
	if (explicitIDDependencies) {
		potentialMod.explicitIDDependencies = explicitIDDependencies;
	}
}

async function populateWorkshopModMetadata(potentialMod: ModData, steamUGCDetails?: SteamUGCDetails): Promise<void> {
	if (!steamUGCDetails) {
		return;
	}

	potentialMod.steamDependencies = steamUGCDetails.children;
	potentialMod.steamDependenciesFetchedAt = Date.now();
	potentialMod.description = steamUGCDetails.description;
	potentialMod.name = steamUGCDetails.title;
	potentialMod.tags = steamUGCDetails.tagsDisplayNames;
	potentialMod.size = steamUGCDetails.fileSize;
	potentialMod.dateAdded = new Date(steamUGCDetails.timeAddedToUserList * 1000);
	potentialMod.dateCreated = new Date(steamUGCDetails.timeCreated * 1000);
	potentialMod.lastWorkshopUpdate = new Date(steamUGCDetails.timeUpdated * 1000);
	potentialMod.preview = steamUGCDetails.previewURL;

	try {
		potentialMod.authors = [await resolvePersonaName(steamUGCDetails.steamIDOwner)];
	} catch (err) {
		log.warn(`Failed to get username for author ${steamUGCDetails.steamIDOwner}`);
		log.warn(err);
		potentialMod.authors = [steamUGCDetails.steamIDOwner];
	}
}

async function getWorkshopDetailsMap(workshopIDs: Iterable<bigint>): Promise<Map<bigint, SteamUGCDetails>> {
	const workshopDetailMap = new Map<bigint, SteamUGCDetails>();

	for (const workshopChunk of chunk([...workshopIDs], MAX_MODS_PER_PAGE)) {
		if (workshopChunk.length === 0) {
			continue;
		}

		try {
			const workshopDetails = await getRawWorkshopDetailsForList(workshopChunk);
			workshopDetails.forEach((detail) => {
				workshopDetailMap.set(detail.publishedFileId, detail);
			});
		} catch (error) {
			log.warn(`Failed to enrich workshop metadata for chunk ${JSON.stringify(workshopChunk, (_, value) => (typeof value === 'bigint' ? value.toString() : value))}`);
			log.warn(error);
		}
	}

	return workshopDetailMap;
}

export async function getModDetailsFromPath(potentialMod: ModData, modPath: string, type: ModType): Promise<ModData | null> {
	log.debug(`Reading mod metadata for ${modPath}`);
	return new Promise((resolve, reject) => {
		fs.readdir(modPath, { withFileTypes: true }, async (err, files) => {
			try {
				if (err) {
					log.error(`fs.readdir failed on path ${modPath}`);
					log.error(err);
					reject(err);
				} else {
					let validModData = false;
					try {
						const stats = fs.statSync(modPath);
						potentialMod.lastUpdate = stats.mtime;
						if (!potentialMod.dateAdded) {
							potentialMod.dateAdded = stats.birthtime;
						}
					} catch (e) {
						log.error(`Failed to get file details for path ${modPath}`);
						log.error(e);
					}
					const fileSizes = files.map((file) => {
						let size = 0;
						if (file.isFile()) {
							try {
								const stats = fs.statSync(path.join(modPath, file.name));
								const { size: fileSize, mtime } = stats;
								size = fileSize;
								if (!potentialMod.lastUpdate || mtime > potentialMod.lastUpdate) {
									potentialMod.lastUpdate = mtime;
								}
							} catch (e) {
								log.error(`Failed to get file details for ${file.name} under ${modPath}`);
							}
							if (file.name === 'preview.png' && !potentialMod.preview) {
								potentialMod.preview = registerPreviewImage(path.join(modPath, file.name));
							} else if (file.name.match(/^(.*)\.dll$/)) {
								potentialMod.hasCode = true;
							} else if (file.name === 'ttsmm.json') {
								applyTtsmmMetadata(potentialMod, JSON.parse(fs.readFileSync(path.join(modPath, file.name), 'utf8')));
							} else {
								const matches = file.name.match(/^(.*)_bundle$/);
								if (matches && matches.length > 1) {
									const [, modId] = matches;
									potentialMod.id = modId;
									if (type !== ModType.WORKSHOP) {
										potentialMod.uid = `${type}:${potentialMod.id}`;
									}
									if (!potentialMod.name || isWorkshopPlaceholderName(potentialMod.name)) {
										potentialMod.name = modId;
									}
									potentialMod.path = modPath;
									validModData = true;
								}
								log.silly(`Found file: ${file.name} under mod path ${modPath}`);
							}
						}
						return size;
					});

					// We are done, increment counter and return
					if (validModData) {
						potentialMod.size = fileSizes.reduce((acc: number, curr: number) => acc + curr, 0);
						resolve(potentialMod);
					} else {
						log.warn(`Marking potential mod at ${modPath} as invalid mod`);
						resolve(null);
					}
				}
			} catch (e) {
				log.error(`Failed to get local mod details at ${modPath}:`);
				log.error(e);
				reject(e);
			}
		});
	});
}

export default class ModFetcher {
	localPath?: string;

	knownWorkshopMods: Set<bigint>;

	progressSender: ProgressSender;

	platform: NodeJS.Platform;

	skipWorkshopSteamworks: boolean;

	localMods: number;

	workshopMods: number;

	loadedMods: number;

	modCountMutex: Mutex;

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

		this.localMods = 0;
		this.workshopMods = 0;
		this.loadedMods = 0;
		this.modCountMutex = new Mutex();

		knownWorkshopMods.forEach((workshopid) => this.knownWorkshopMods.add(workshopid));
	}

	updateModLoadingProgress(size: number) {
		this.modCountMutex.runExclusive(() => {
			const current = this.loadedMods;
			this.loadedMods += size;
			const total = (this.localMods || 0) + (this.workshopMods || 0);
			log.silly(`Loaded ${size} new mods. Old total: ${current}, Local: ${this.localMods}, Workshop: ${this.workshopMods}`);
			this.progressSender.send(ValidChannel.PROGRESS_CHANGE, ProgressTypes.MOD_LOAD, (current + size) / total, 'Loading mod details');
		});
	}

	async fetchLocalMods(localModDirs: string[]): Promise<ModData[]> {
		const modResponses = await Promise.allSettled<ModData | null>(
			localModDirs.map((subDir: string) => {
				const modPath = path.join(this.localPath!, subDir);
				const potentialMod: ModData = {
					uid: `${ModType.LOCAL}:${subDir}`,
					id: null,
					type: ModType.LOCAL,
					hasCode: false,
					path: modPath
				};
				return getModDetailsFromPath(potentialMod, modPath, ModType.LOCAL).finally(() => {
					this.updateModLoadingProgress(1);
				});
			})
		);
		return filterOutNullValues(modResponses);
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
		const modChunks: bigint[][] = chunk([...modList], MAX_MODS_PER_PAGE);
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
			this.workshopMods = totalItems;
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
			this.workshopMods += missingKnownWorkshopMods.size;
			 
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
		this.workshopMods = workshopIDs.size;
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

		// get local fist
		let localModDirs: string[] = [];
		if (this.localPath) {
			try {
				localModDirs = fs
					.readdirSync(this.localPath, { withFileTypes: true })
					.filter((dirent) => dirent.isDirectory())
					.map((dirent) => dirent.name);
				this.localMods = localModDirs.length;
			} catch (e) {
				log.error(`Failed to read local mods in ${localModDirs}`);
			}
		}

		const modResponses = await Promise.allSettled<ModData[]>([this.fetchLocalMods(localModDirs), this.fetchWorkshopMods()]);
		const allMods: ModData[] = filterOutNullValues(modResponses).flat();

		// We are done
		this.progressSender.send(ValidChannel.PROGRESS_CHANGE, ProgressTypes.MOD_LOAD, 1.0, 'Finished loading mods'); // Return a value > 1.0 to signal we are done
		return allMods;
	}
}

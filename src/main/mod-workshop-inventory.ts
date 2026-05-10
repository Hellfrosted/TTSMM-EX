import log from 'electron-log';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { isSuccessful } from '../util/Promise';
import { chunkWorkshopIds, getWorkshopDetailsMap } from './mod-workshop-metadata';
import type { ModInventoryProgress } from './mod-inventory-progress';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import { getSteamSubscribedPage, shouldSkipWorkshopFetch } from './mod-workshop-paging';
import { WorkshopInventoryResolver } from './workshop-inventory-resolution';
import type { WorkshopDependencyLookup } from './workshop-dependencies';

interface WorkshopDependencyExpansionAdapters {
	getDetailsForWorkshopModList: (workshopIDs: bigint[]) => Promise<ModData[]>;
	knownWorkshopMods: Set<bigint>;
	options?: NuterraSteamCompatibilityOptions;
	refreshWorkshopDependencies?: (workshopID: bigint) => Promise<WorkshopDependencyLookup | null>;
	updateModLoadingProgress: (size: number) => void;
}

interface LinuxWorkshopInventoryInput {
	buildWorkshopMod: (workshopID: bigint, steamUGCDetails?: SteamUGCDetails, keepUnknownWorkshopItem?: boolean) => Promise<ModData | null>;
	knownWorkshopMods: Set<bigint>;
	progress: ModInventoryProgress;
}

interface WorkshopInventoryInput extends LinuxWorkshopInventoryInput {
	getDetailsForWorkshopModList: (workshopIDs: bigint[]) => Promise<ModData[]>;
	options?: NuterraSteamCompatibilityOptions;
	platform: NodeJS.Platform;
	refreshWorkshopDependencies?: (workshopID: bigint) => Promise<WorkshopDependencyLookup | null>;
	skipWorkshopSteamworks: boolean;
	updateModLoadingProgress: (size: number) => void;
}

export function filterSettledModResults<T>(responses: PromiseSettledResult<T | null>[]): T[] {
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

export async function resolveWorkshopDependencyChunk(
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Promise<Set<bigint>> {
	const modChunks = chunkWorkshopIds([...modList]);
	log.silly(JSON.stringify(modChunks, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

	const resolver = new WorkshopInventoryResolver(adapters.knownWorkshopMods, workshopMap, knownInvalidMods, adapters.options);
	const modDependencies: Set<bigint> = new Set();

	for (let i = 0; i < modChunks.length; i++) {
		try {
			log.silly(`Processing known mod chunk: ${JSON.stringify(modChunks[i], (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);

			const modDetails = await adapters.getDetailsForWorkshopModList(modChunks[i]);
			log.silly(`Got mod details: ${JSON.stringify(modDetails, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);
			modDetails.forEach((mod: ModData) => {
				log.silly(`Got results for workshop mod ${mod.name} (${mod.uid})`);
			});
			await refreshWorkshopDependencySnapshots(modDetails, resolver, adapters.refreshWorkshopDependencies);
			resolver.addResolvedMods(modDetails);

			resolver.collectMissingDependencies(modDetails).forEach((missingDependency) => modDependencies.add(missingDependency));
		} catch (e) {
			log.error(e instanceof Error ? e : 'Error processing chunk');
			adapters.updateModLoadingProgress(modChunks[i].length);
		}
	}

	return modDependencies;
}

async function refreshWorkshopDependencySnapshots(
	mods: Iterable<ModData>,
	resolver: WorkshopInventoryResolver,
	refreshWorkshopDependencies?: (workshopID: bigint) => Promise<WorkshopDependencyLookup | null>
) {
	if (!refreshWorkshopDependencies) {
		return;
	}

	const modList = [...mods];
	const refreshCandidates = resolver.getDependencyRefreshCandidates(modList);
	for (const workshopID of refreshCandidates) {
		try {
			const dependencyLookup = await refreshWorkshopDependencies(workshopID);
			if (!dependencyLookup) {
				log.warn(`Workshop dependency lookup for ${workshopID} returned no dependency data.`);
				continue;
			}
			const mod = resolver.workshopMap.get(workshopID) ?? modList.find((candidate) => candidate.workshopID === workshopID);
			if (!mod) {
				continue;
			}
			mod.steamDependencies = dependencyLookup.steamDependencies;
			mod.steamDependencyNames = dependencyLookup.steamDependencyNames;
			mod.steamDependenciesFetchedAt = dependencyLookup.steamDependenciesFetchedAt;
		} catch (error) {
			log.warn(`Failed to refresh Workshop dependency snapshot for ${workshopID}.`);
			log.warn(error);
		}
	}
}

async function fetchLinuxWorkshopInventory({
	buildWorkshopMod,
	knownWorkshopMods,
	progress
}: LinuxWorkshopInventoryInput): Promise<ModData[]> {
	const allSubscribedItems = Steamworks.getSubscribedItems();
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const workshopIDs = new Set<bigint>([...allSubscribedItems, ...explicitKnownWorkshopMods]);

	log.debug(`All subscribed items: [${allSubscribedItems}]`);
	progress.workshopMods = workshopIDs.size;
	const workshopDetailsMap = await getWorkshopDetailsMap(workshopIDs);

	const modResponses = await Promise.allSettled<ModData | null>(
		[...workshopIDs].map((workshopID) => {
			return buildWorkshopMod(workshopID, workshopDetailsMap.get(workshopID), explicitKnownWorkshopMods.has(workshopID));
		})
	);
	return filterSettledModResults(modResponses);
}

async function buildWorkshopMods(
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: LinuxWorkshopInventoryInput['buildWorkshopMod']
): Promise<ModData[]> {
	const modResponses = await Promise.allSettled<ModData | null>(
		steamDetails.map((steamUGCDetails) => buildWorkshopMod(steamUGCDetails.publishedFileId, steamUGCDetails))
	);
	return filterSettledModResults(modResponses);
}

export async function fetchWorkshopInventory({
	buildWorkshopMod,
	getDetailsForWorkshopModList,
	knownWorkshopMods,
	options,
	platform,
	progress,
	refreshWorkshopDependencies,
	skipWorkshopSteamworks,
	updateModLoadingProgress
}: WorkshopInventoryInput): Promise<ModData[]> {
	if (skipWorkshopSteamworks) {
		log.warn('Skipping Steam Workshop scan because Steamworks is bypassed for this run.');
		return [];
	}

	if (shouldSkipWorkshopFetch(platform)) {
		return [];
	}

	if (platform === 'linux') {
		return fetchLinuxWorkshopInventory({
			buildWorkshopMod,
			knownWorkshopMods,
			progress
		});
	}

	let numProcessedWorkshop = 0;
	let pageNum = 1;
	let lastProcessed = 1;
	const resolver = new WorkshopInventoryResolver(knownWorkshopMods, new Map(), new Set(), options);

	if (log.transports.file.level === 'debug' || log.transports.file.level === 'silly') {
		const allSubscribedItems: bigint[] = Steamworks.getSubscribedItems();
		log.debug(`All subscribed items: [${allSubscribedItems}]`);
	}

	while (lastProcessed > 0) {
		const { items, totalItems, numReturned } = await getSteamSubscribedPage(pageNum);
		progress.workshopMods = totalItems;
		numProcessedWorkshop += numReturned;
		lastProcessed = numReturned;
		log.debug(`Total items: ${totalItems}, Returned by Steam: ${numReturned}, Processed this chunk: ${items.length}`);

		const data = await buildWorkshopMods(items, buildWorkshopMod);
		resolver.addResolvedMods(data);
		pageNum += 1;
	}

	await refreshWorkshopDependencySnapshots(resolver.workshopMap.values(), resolver, refreshWorkshopDependencies);
	resolver.queueMissingDependencies(resolver.workshopMap.values());

	if (resolver.workshopMap.size !== numProcessedWorkshop) {
		log.debug(
			`Steam returned ${numProcessedWorkshop} subscribed workshop entries, ` +
				`but loaded ${resolver.workshopMap.size} valid unique mods. ` +
				'Filtered or duplicate entries are expected to make these counts differ.'
		);
	}

	let missingKnownWorkshopMods = resolver.getPendingWorkshopMods();

	while (resolver.pendingWorkshopMods.size > 0) {
		progress.workshopMods += missingKnownWorkshopMods.size;

		missingKnownWorkshopMods = await resolveWorkshopDependencyChunk(
			resolver.workshopMap,
			resolver.knownInvalidMods,
			missingKnownWorkshopMods,
			{
				getDetailsForWorkshopModList,
				knownWorkshopMods: resolver.pendingWorkshopMods,
				options,
				refreshWorkshopDependencies,
				updateModLoadingProgress
			}
		);
		resolver.markPendingWorkshopModsInvalid().forEach((workshopID) => {
			log.error(`Known workshop mod ${workshopID} is invalid`);
		});
		resolver.replacePendingWorkshopMods(missingKnownWorkshopMods);
	}

	return resolver.getWorkshopMods();
}

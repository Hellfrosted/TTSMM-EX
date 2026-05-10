import log from 'electron-log';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { isSuccessful } from '../util/Promise';
import { chunkWorkshopIds, getWorkshopDetailsMap } from './mod-workshop-metadata';
import type { ModInventoryProgress } from './mod-inventory-progress';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import { getSteamSubscribedPage, shouldSkipWorkshopFetch } from './mod-workshop-paging';
import { WorkshopInventoryResolver } from './workshop-inventory-resolution';
import { applyWorkshopDependencySnapshotResult, ingestWorkshopDependencySnapshotBatch } from './workshop-dependencies';

interface WorkshopDependencyExpansionAdapters {
	getDetailsForWorkshopModList: (workshopIDs: bigint[]) => Promise<ModData[]>;
	knownWorkshopMods: Set<bigint>;
	options?: NuterraSteamCompatibilityOptions;
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
			resolver.addResolvedMods(modDetails);

			resolver.collectMissingDependencies(modDetails).forEach((missingDependency) => modDependencies.add(missingDependency));
		} catch (e) {
			log.error(e instanceof Error ? e : 'Error processing chunk');
			adapters.updateModLoadingProgress(modChunks[i].length);
		}
	}

	return modDependencies;
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
	const workshopDetails = [...workshopDetailsMap.values()];

	const modsWithDetails = await buildWorkshopMods(workshopDetails, buildWorkshopMod, (workshopID) =>
		explicitKnownWorkshopMods.has(workshopID)
	);
	const missingDetailResponses = await Promise.allSettled<ModData | null>(
		[...workshopIDs]
			.filter((workshopID) => !workshopDetailsMap.has(workshopID))
			.map((workshopID) => buildWorkshopMod(workshopID, undefined, explicitKnownWorkshopMods.has(workshopID)))
	);
	return [...modsWithDetails, ...filterSettledModResults(missingDetailResponses)];
}

export async function buildWorkshopMods(
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: LinuxWorkshopInventoryInput['buildWorkshopMod'],
	keepUnknownWorkshopItem: (workshopID: bigint) => boolean = () => false
): Promise<ModData[]> {
	const dependencySnapshots = await ingestWorkshopDependencySnapshotBatch(steamDetails);
	const modResponses = await Promise.allSettled<ModData | null>(
		steamDetails.map(async (steamUGCDetails) => {
			const mod = await buildWorkshopMod(
				steamUGCDetails.publishedFileId,
				steamUGCDetails,
				keepUnknownWorkshopItem(steamUGCDetails.publishedFileId)
			);
			const dependencySnapshot = dependencySnapshots.get(steamUGCDetails.publishedFileId);
			if (mod && dependencySnapshot) {
				applyWorkshopDependencySnapshotResult(mod, dependencySnapshot);
			}
			return mod;
		})
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
	updateModLoadingProgress
}: WorkshopInventoryInput): Promise<ModData[]> {
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

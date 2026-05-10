import log from 'electron-log';
import { Effect } from 'effect';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { chunkWorkshopIds, getWorkshopDetailsMap } from './mod-workshop-metadata';
import type { ModInventoryProgress } from './mod-inventory-progress';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import { getSteamSubscribedPage, shouldSkipWorkshopFetch } from './mod-workshop-paging';
import { WorkshopInventoryResolver } from './workshop-inventory-resolution';
import { applyWorkshopDependencySnapshotResult, ingestWorkshopDependencySnapshotBatch } from './workshop-dependencies';
import type { SteamPersonaCache } from './steam-persona-cache';

interface WorkshopDependencyExpansionAdapters {
	getDetailsForWorkshopModList: (workshopIDs: bigint[]) => Effect.Effect<ModData[], unknown, SteamPersonaCache>;
	knownWorkshopMods: Set<bigint>;
	options?: NuterraSteamCompatibilityOptions;
	updateModLoadingProgress: (size: number) => void;
}

interface LinuxWorkshopInventoryInput {
	buildWorkshopMod: (
		workshopID: bigint,
		steamUGCDetails?: SteamUGCDetails,
		keepUnknownWorkshopItem?: boolean
	) => Effect.Effect<ModData | null, unknown, SteamPersonaCache>;
	knownWorkshopMods: Set<bigint>;
	progress: ModInventoryProgress;
}

interface WorkshopInventoryInput extends LinuxWorkshopInventoryInput {
	getDetailsForWorkshopModList: (workshopIDs: bigint[]) => Effect.Effect<ModData[], unknown, SteamPersonaCache>;
	options?: NuterraSteamCompatibilityOptions;
	platform: NodeJS.Platform;
	updateModLoadingProgress: (size: number) => void;
}

export const resolveWorkshopDependencyChunk = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<Set<bigint>, unknown, SteamPersonaCache> {
	const modChunks = chunkWorkshopIds([...modList]);
	log.silly(JSON.stringify(modChunks, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

	const resolver = new WorkshopInventoryResolver(adapters.knownWorkshopMods, workshopMap, knownInvalidMods, adapters.options);
	const modDependencies: Set<bigint> = new Set();

	for (let i = 0; i < modChunks.length; i++) {
		log.silly(`Processing known mod chunk: ${JSON.stringify(modChunks[i], (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);

		const modDetails = yield* adapters.getDetailsForWorkshopModList(modChunks[i]).pipe(
			Effect.catch((error) => {
				log.error(error instanceof Error ? error : 'Error processing chunk');
				adapters.updateModLoadingProgress(modChunks[i].length);
				return Effect.succeed<ModData[]>([]);
			})
		);
		log.silly(`Got mod details: ${JSON.stringify(modDetails, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);
		modDetails.forEach((mod: ModData) => {
			log.silly(`Got results for workshop mod ${mod.name} (${mod.uid})`);
		});
		resolver.addResolvedMods(modDetails);

		resolver.collectMissingDependencies(modDetails).forEach((missingDependency) => modDependencies.add(missingDependency));
	}

	return modDependencies;
});

const fetchLinuxWorkshopInventory = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	knownWorkshopMods,
	progress
}: LinuxWorkshopInventoryInput): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	const allSubscribedItems = yield* Effect.try({
		try: () => Steamworks.getSubscribedItems(),
		catch: (error) => error
	});
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const workshopIDs = new Set<bigint>([...allSubscribedItems, ...explicitKnownWorkshopMods]);

	log.debug(`All subscribed items: [${allSubscribedItems}]`);
	progress.workshopMods = workshopIDs.size;
	const workshopDetailsMap = yield* getWorkshopDetailsMap(workshopIDs);
	const workshopDetails = [...workshopDetailsMap.values()];

	const modsWithDetails = yield* buildWorkshopMods(workshopDetails, buildWorkshopMod, (workshopID) =>
		explicitKnownWorkshopMods.has(workshopID)
	);
	const missingDetailMods = yield* Effect.forEach(
		Array.from(workshopIDs).flatMap((workshopID) =>
			workshopDetailsMap.has(workshopID)
				? []
				: [
						buildWorkshopMod(workshopID, undefined, explicitKnownWorkshopMods.has(workshopID)).pipe(
							Effect.catch((error) => {
								log.error('Failed to process some mod data:');
								log.error(error);
								return Effect.succeed<ModData | null>(null);
							})
						)
					]
		),
		(effect) => effect,
		{ concurrency: 'unbounded' }
	);
	return [...modsWithDetails, ...missingDetailMods.filter((mod): mod is ModData => !!mod)];
});

export const buildWorkshopMods = Effect.fnUntraced(function* (
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: LinuxWorkshopInventoryInput['buildWorkshopMod'],
	keepUnknownWorkshopItem: (workshopID: bigint) => boolean = () => false
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	const dependencySnapshots = yield* ingestWorkshopDependencySnapshotBatch(steamDetails);
	const mods = yield* Effect.forEach(
		steamDetails,
		(steamUGCDetails) =>
			buildWorkshopMod(steamUGCDetails.publishedFileId, steamUGCDetails, keepUnknownWorkshopItem(steamUGCDetails.publishedFileId)).pipe(
				Effect.map((mod) => {
					const dependencySnapshot = dependencySnapshots.get(steamUGCDetails.publishedFileId);
					if (mod && dependencySnapshot) {
						applyWorkshopDependencySnapshotResult(mod, dependencySnapshot);
					}
					return mod;
				}),
				Effect.catch((error) => {
					log.error('Failed to process some mod data:');
					log.error(error);
					return Effect.succeed<ModData | null>(null);
				})
			),
		{ concurrency: 'unbounded' }
	);
	return mods.filter((mod): mod is ModData => !!mod);
});

export const fetchWorkshopInventory = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	getDetailsForWorkshopModList,
	knownWorkshopMods,
	options,
	platform,
	progress,
	updateModLoadingProgress
}: WorkshopInventoryInput): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	if (shouldSkipWorkshopFetch(platform)) {
		return [];
	}

	if (platform === 'linux') {
		return yield* fetchLinuxWorkshopInventory({
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
		const allSubscribedItems = yield* Effect.try({
			try: () => Steamworks.getSubscribedItems(),
			catch: (error) => error
		}).pipe(
			Effect.catch((error) => {
				log.debug('Failed to read subscribed Workshop items for debug logging.');
				log.debug(error);
				return Effect.succeed<bigint[]>([]);
			})
		);
		log.debug(`All subscribed items: [${allSubscribedItems}]`);
	}

	while (lastProcessed > 0) {
		const { items, totalItems, numReturned } = yield* getSteamSubscribedPage(pageNum);
		progress.workshopMods = totalItems;
		numProcessedWorkshop += numReturned;
		lastProcessed = numReturned;
		log.debug(`Total items: ${totalItems}, Returned by Steam: ${numReturned}, Processed this chunk: ${items.length}`);

		const data = yield* buildWorkshopMods(items, buildWorkshopMod);
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

		missingKnownWorkshopMods = yield* resolveWorkshopDependencyChunk(
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
});

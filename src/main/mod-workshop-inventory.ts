import { Effect } from 'effect';
import log from 'electron-log';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import type { ModInventoryProgress } from './mod-inventory-progress';
import { chunkWorkshopIds, getWorkshopDetailsMap } from './mod-workshop-metadata';
import { getSteamSubscribedPage, shouldSkipWorkshopFetch } from './mod-workshop-paging';
import type { SteamPersonaCache } from './steam-persona-cache';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import { applyWorkshopDependencySnapshotResult, ingestWorkshopDependencySnapshotBatch } from './workshop-dependencies';
import { WorkshopInventoryResolver } from './workshop-inventory-resolution';

export type UnresolvedWorkshopReason = 'non-mod' | 'duplicate' | 'metadata-failed' | 'hydration-failed';

export interface UnresolvedWorkshopItem {
	reason: UnresolvedWorkshopReason;
	workshopID: bigint;
}

export interface WorkshopInventoryScanOutcome {
	mods: ModData[];
	stats: {
		dependencyItems: number;
		knownItems: number;
		subscribedItems: number;
	};
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

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

interface WorkshopModBuildOutcome {
	mods: ModData[];
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

interface WorkshopDependencyChunkOutcome {
	missingDependencies: Set<bigint>;
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

function createEmptyWorkshopInventoryScanOutcome(): WorkshopInventoryScanOutcome {
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

function getUnresolvedWorkshopReason(steamUGCDetails: SteamUGCDetails | undefined): UnresolvedWorkshopReason {
	if (!steamUGCDetails) {
		return 'metadata-failed';
	}
	return steamUGCDetails.tags?.some((tag) => tag.toLowerCase() === 'mods') ? 'hydration-failed' : 'non-mod';
}

function appendUniqueUnresolvedWorkshopItem(items: UnresolvedWorkshopItem[], item: UnresolvedWorkshopItem) {
	if (!items.some((current) => current.workshopID === item.workshopID && current.reason === item.reason)) {
		items.push(item);
	}
}

function hasUnresolvedWorkshopItem(items: UnresolvedWorkshopItem[], workshopID: bigint) {
	return items.some((item) => item.workshopID === workshopID);
}

function addResolvedModsToResolver(
	resolver: WorkshopInventoryResolver,
	mods: Iterable<ModData>,
	unresolvedWorkshopItems: UnresolvedWorkshopItem[]
) {
	for (const mod of mods) {
		if (mod.workshopID !== undefined && resolver.workshopMap.has(mod.workshopID)) {
			appendUniqueUnresolvedWorkshopItem(unresolvedWorkshopItems, {
				workshopID: mod.workshopID,
				reason: 'duplicate'
			});
			continue;
		}
		resolver.addResolvedMod(mod);
	}
}

const resolveWorkshopDependencyChunkOutcome = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<WorkshopDependencyChunkOutcome, unknown, SteamPersonaCache> {
	const modChunks = chunkWorkshopIds([...modList]);
	log.silly(JSON.stringify(modChunks, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

	const resolver = new WorkshopInventoryResolver(adapters.knownWorkshopMods, workshopMap, knownInvalidMods, adapters.options);
	const modDependencies: Set<bigint> = new Set();
	const unresolvedWorkshopItems: UnresolvedWorkshopItem[] = [];

	for (let i = 0; i < modChunks.length; i++) {
		log.silly(`Processing known mod chunk: ${JSON.stringify(modChunks[i], (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);

		const requestedWorkshopIDs = new Set(modChunks[i]);
		let metadataFailed = false;
		const modDetails = yield* adapters.getDetailsForWorkshopModList(modChunks[i]).pipe(
			Effect.catch((error) => {
				log.error(error instanceof Error ? error : 'Error processing chunk');
				adapters.updateModLoadingProgress(modChunks[i].length);
				metadataFailed = true;
				return Effect.succeed<ModData[]>([]);
			})
		);
		if (metadataFailed) {
			requestedWorkshopIDs.forEach((workshopID) => {
				appendUniqueUnresolvedWorkshopItem(unresolvedWorkshopItems, {
					workshopID,
					reason: 'metadata-failed'
				});
			});
			continue;
		}
		log.silly(`Got mod details: ${JSON.stringify(modDetails, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`);
		modDetails.forEach((mod: ModData) => {
			log.silly(`Got results for workshop mod ${mod.name} (${mod.uid})`);
			if (mod.workshopID !== undefined) {
				requestedWorkshopIDs.delete(mod.workshopID);
			}
		});
		resolver.addResolvedMods(modDetails);
		requestedWorkshopIDs.forEach((workshopID) => {
			appendUniqueUnresolvedWorkshopItem(unresolvedWorkshopItems, {
				workshopID,
				reason: 'hydration-failed'
			});
		});

		resolver.collectMissingDependencies(modDetails).forEach((missingDependency) => modDependencies.add(missingDependency));
	}

	return {
		missingDependencies: modDependencies,
		unresolvedWorkshopItems
	};
});

export const resolveWorkshopDependencyChunk = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<Set<bigint>, unknown, SteamPersonaCache> {
	const outcome = yield* resolveWorkshopDependencyChunkOutcome(workshopMap, knownInvalidMods, modList, adapters);
	return outcome.missingDependencies;
});

const scanLinuxWorkshopInventory = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	knownWorkshopMods,
	progress
}: LinuxWorkshopInventoryInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	const allSubscribedItems = yield* Effect.try({
		try: () => Steamworks.getSubscribedItems(),
		catch: (error) => error
	});
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const workshopIDs = new Set<bigint>([...allSubscribedItems, ...explicitKnownWorkshopMods]);
	const outcome = createEmptyWorkshopInventoryScanOutcome();
	outcome.stats.subscribedItems = allSubscribedItems.length;
	outcome.stats.knownItems = explicitKnownWorkshopMods.size;

	log.debug(`All subscribed items: [${allSubscribedItems}]`);
	progress.workshopMods = workshopIDs.size;
	const workshopDetailsMap = yield* getWorkshopDetailsMap(workshopIDs);
	const workshopDetails = [...workshopDetailsMap.values()];

	const modsWithDetails = yield* buildWorkshopModBatch(workshopDetails, buildWorkshopMod, (workshopID) =>
		explicitKnownWorkshopMods.has(workshopID)
	);
	const missingDetailMods = yield* Effect.forEach(
		Array.from(workshopIDs).flatMap((workshopID) =>
			workshopDetailsMap.has(workshopID)
				? []
				: [
						buildWorkshopMod(workshopID, undefined, explicitKnownWorkshopMods.has(workshopID)).pipe(
							Effect.map((mod) => {
								if (!mod) {
									appendUniqueUnresolvedWorkshopItem(outcome.unresolvedWorkshopItems, {
										workshopID,
										reason: 'metadata-failed'
									});
								}
								return mod;
							}),
							Effect.catch((error) => {
								log.error('Failed to process some mod data:');
								log.error(error);
								appendUniqueUnresolvedWorkshopItem(outcome.unresolvedWorkshopItems, {
									workshopID,
									reason: 'metadata-failed'
								});
								return Effect.succeed<ModData | null>(null);
							})
						)
					]
		),
		(effect) => effect,
		{ concurrency: 'unbounded' }
	);
	outcome.mods = [...modsWithDetails.mods, ...missingDetailMods.filter((mod): mod is ModData => !!mod)];
	outcome.unresolvedWorkshopItems.push(...modsWithDetails.unresolvedWorkshopItems);
	return outcome;
});

export const buildWorkshopModBatch = Effect.fnUntraced(function* (
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: LinuxWorkshopInventoryInput['buildWorkshopMod'],
	keepUnknownWorkshopItem: (workshopID: bigint) => boolean = () => false
): Effect.fn.Return<WorkshopModBuildOutcome, unknown, SteamPersonaCache> {
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
	const unresolvedWorkshopItems = mods.flatMap((mod, index) =>
		mod
			? []
			: [
					{
						workshopID: steamDetails[index].publishedFileId,
						reason: getUnresolvedWorkshopReason(steamDetails[index])
					} satisfies UnresolvedWorkshopItem
				]
	);
	return {
		mods: mods.filter((mod): mod is ModData => !!mod),
		unresolvedWorkshopItems
	};
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
	progress,
	updateModLoadingProgress
}: WorkshopInventoryInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	if (shouldSkipWorkshopFetch(platform)) {
		return createEmptyWorkshopInventoryScanOutcome();
	}

	if (platform === 'linux') {
		return yield* scanLinuxWorkshopInventory({
			buildWorkshopMod,
			knownWorkshopMods,
			progress
		});
	}

	let numProcessedWorkshop = 0;
	let pageNum = 1;
	let lastProcessed = 1;
	const resolver = new WorkshopInventoryResolver(knownWorkshopMods, new Map(), new Set(), options);
	const unresolvedWorkshopItems: UnresolvedWorkshopItem[] = [];
	let dependencyItems = 0;

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

		const data = yield* buildWorkshopModBatch(items, buildWorkshopMod);
		unresolvedWorkshopItems.push(...data.unresolvedWorkshopItems);
		addResolvedModsToResolver(resolver, data.mods, unresolvedWorkshopItems);
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
		dependencyItems += missingKnownWorkshopMods.size;

		const dependencyChunkOutcome = yield* resolveWorkshopDependencyChunkOutcome(
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
		unresolvedWorkshopItems.push(...dependencyChunkOutcome.unresolvedWorkshopItems);
		missingKnownWorkshopMods = dependencyChunkOutcome.missingDependencies;
		resolver.markPendingWorkshopModsInvalid().forEach((workshopID) => {
			log.error(`Known workshop mod ${workshopID} is invalid`);
			if (hasUnresolvedWorkshopItem(unresolvedWorkshopItems, workshopID)) {
				return;
			}
			appendUniqueUnresolvedWorkshopItem(unresolvedWorkshopItems, {
				workshopID,
				reason: 'hydration-failed'
			});
		});
		resolver.replacePendingWorkshopMods(missingKnownWorkshopMods);
	}

	return {
		mods: resolver.getWorkshopMods(),
		stats: {
			dependencyItems,
			knownItems: knownWorkshopMods.size,
			subscribedItems: numProcessedWorkshop
		},
		unresolvedWorkshopItems
	};
});

export const fetchWorkshopInventory = Effect.fnUntraced(function* (
	input: WorkshopInventoryInput
): Effect.fn.Return<ModData[], unknown, SteamPersonaCache> {
	const outcome = yield* scanWorkshopInventory(input);
	return outcome.mods;
});

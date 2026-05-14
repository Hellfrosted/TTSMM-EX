import { Effect } from 'effect';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { collectMissingWorkshopDependencies } from './mod-workshop-dependencies';
import { chunkWorkshopIds } from './mod-workshop-metadata';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { SteamUGCDetails } from './steamworks';
import { applyWorkshopDependencySnapshotResult, ingestWorkshopDependencySnapshotBatch } from './workshop-dependencies';

export type UnresolvedWorkshopReason = 'non-mod' | 'duplicate' | 'metadata-failed' | 'hydration-failed';
export type WorkshopInventoryItemSource = 'subscribed' | 'known' | 'dependency';

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

export interface WorkshopInventorySubscribedPage {
	items: SteamUGCDetails[];
	itemIDs?: Iterable<bigint>;
	numReturned: number;
	totalItems: number;
}

export type WorkshopInventoryProgressEffect =
	| {
			count: number;
			type: 'increment-loaded-mods' | 'increment-workshop-total';
	  }
	| {
			total: number;
			type: 'set-workshop-total';
	  };

export interface WorkshopModBuildOutcome {
	mods: ModData[];
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

export interface WorkshopDependencyChunkOutcome {
	missingDependencies: Set<bigint>;
	resolvedRecords: WorkshopInventoryResolvedRecord[];
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

export interface WorkshopDependencyExpansionAdapters {
	getDetailsForWorkshopModList: (
		workshopIDs: bigint[],
		keepUnknownWorkshopItem?: (workshopID: bigint) => boolean
	) => Effect.Effect<ModData[], unknown, SteamPersonaCache>;
	keepUnknownWorkshopItem?: (workshopID: bigint) => boolean;
	knownWorkshopMods: Set<bigint>;
	onProgressEffect?: (effect: WorkshopInventoryProgressEffect) => void;
	options?: NuterraSteamCompatibilityOptions;
}

export interface WorkshopInventoryDependencyExpansionOptions {
	adapters: WorkshopDependencyExpansionAdapters;
	onProgressEffect?: (effect: WorkshopInventoryProgressEffect) => void;
}

type BuildWorkshopMod = (
	workshopID: bigint,
	steamUGCDetails?: SteamUGCDetails,
	keepUnknownWorkshopItem?: boolean
) => Effect.Effect<ModData | null, unknown, SteamPersonaCache>;

interface WorkshopInventoryRecord {
	mod: ModData;
	source: WorkshopInventoryItemSource;
}

export interface WorkshopInventoryExpansionScanInput {
	buildWorkshopMod: BuildWorkshopMod;
	fetchSubscribedPage: (page: number) => Effect.Effect<WorkshopInventorySubscribedPage, unknown, SteamPersonaCache>;
	getDetailsForWorkshopModList: WorkshopDependencyExpansionAdapters['getDetailsForWorkshopModList'];
	knownWorkshopMods: Set<bigint>;
	logDebug?: (message: string) => void;
	onProgressEffect?: (effect: WorkshopInventoryProgressEffect) => void;
	options?: NuterraSteamCompatibilityOptions;
}

export interface WorkshopInventorySubscribedPageObservation {
	builtPageMods: WorkshopModBuildOutcome;
	missingDetailMods: WorkshopModBuildOutcome;
	page: WorkshopInventorySubscribedPage;
}

export interface WorkshopInventorySubscribedPageTransition {
	progressEffect: WorkshopInventoryProgressEffect;
	resolvedRecords: WorkshopInventoryResolvedRecord[];
	subscribedItems: number;
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

export interface WorkshopInventoryResolvedRecord extends WorkshopInventoryRecord {}

export function createEmptyWorkshopInventoryScanOutcome(): WorkshopInventoryScanOutcome {
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

export function getUnresolvedWorkshopReason(steamUGCDetails: SteamUGCDetails | undefined): UnresolvedWorkshopReason {
	if (!steamUGCDetails) {
		return 'metadata-failed';
	}
	return steamUGCDetails.tags?.some((tag) => tag.toLowerCase() === 'mods') ? 'hydration-failed' : 'non-mod';
}

export function appendUniqueUnresolvedWorkshopItem(items: UnresolvedWorkshopItem[], item: UnresolvedWorkshopItem) {
	if (!items.some((current) => current.workshopID === item.workshopID && current.reason === item.reason)) {
		items.push(item);
	}
}

export function hasUnresolvedWorkshopItem(items: UnresolvedWorkshopItem[], workshopID: bigint) {
	return items.some((item) => item.workshopID === workshopID);
}

function getWorkshopInventorySourceRank(source: WorkshopInventoryItemSource) {
	switch (source) {
		case 'known':
			return 3;
		case 'subscribed':
			return 2;
		case 'dependency':
			return 1;
	}
}

function getWorkshopInventoryRecordQuality(mod: ModData) {
	if (mod.installed || !!mod.path || !!mod.id) {
		return 2;
	}
	return 1;
}

function shouldPreferWorkshopInventoryRecord(current: WorkshopInventoryRecord, candidate: WorkshopInventoryRecord) {
	const currentQuality = getWorkshopInventoryRecordQuality(current.mod);
	const candidateQuality = getWorkshopInventoryRecordQuality(candidate.mod);
	if (candidateQuality !== currentQuality) {
		return candidateQuality > currentQuality;
	}

	return getWorkshopInventorySourceRank(candidate.source) > getWorkshopInventorySourceRank(current.source);
}

export class WorkshopInventoryExpansion {
	private readonly recordsByWorkshopID: Map<bigint, WorkshopInventoryRecord>;

	private readonly unresolvedWorkshopItems: UnresolvedWorkshopItem[];

	private readonly pendingWorkshopMods: Set<bigint>;

	private readonly knownInvalidMods: Set<bigint>;

	readonly options: NuterraSteamCompatibilityOptions;

	constructor(
		pendingWorkshopMods: Set<bigint> = new Set(),
		workshopMap: Map<bigint, ModData> = new Map(),
		knownInvalidMods: Set<bigint> = new Set(),
		options: NuterraSteamCompatibilityOptions = {},
		unresolvedWorkshopItems: UnresolvedWorkshopItem[] = []
	) {
		this.pendingWorkshopMods = new Set(pendingWorkshopMods);
		this.knownInvalidMods = new Set(knownInvalidMods);
		this.options = options;
		this.unresolvedWorkshopItems = [...unresolvedWorkshopItems];
		this.recordsByWorkshopID = new Map(
			[...workshopMap.entries()].map(([workshopID, mod]) => [workshopID, { mod, source: 'subscribed' as const }])
		);
	}

	getResolvedWorkshopModMap(): Map<bigint, ModData> {
		return new Map([...this.recordsByWorkshopID.entries()].map(([workshopID, record]) => [workshopID, record.mod]));
	}

	addResolvedMod(mod: ModData, source: WorkshopInventoryItemSource = 'subscribed'): 'added' | 'discarded-duplicate' | 'replaced-duplicate' {
		const workshopID = mod.workshopID;
		if (workshopID === undefined) {
			return 'discarded-duplicate';
		}

		const candidate = { mod, source };
		const current = this.recordsByWorkshopID.get(workshopID);
		this.pendingWorkshopMods.delete(workshopID);
		this.knownInvalidMods.delete(workshopID);

		if (!current) {
			this.recordsByWorkshopID.set(workshopID, candidate);
			return 'added';
		}

		if (shouldPreferWorkshopInventoryRecord(current, candidate)) {
			this.recordsByWorkshopID.set(workshopID, candidate);
			return 'replaced-duplicate';
		}

		return 'discarded-duplicate';
	}

	addResolvedMods(mods: Iterable<ModData>, source: WorkshopInventoryItemSource = 'subscribed') {
		for (const mod of mods) {
			const result = this.addResolvedMod(mod, source);
			if (result === 'discarded-duplicate' && mod.workshopID !== undefined) {
				this.recordUnresolvedWorkshopItem({
					workshopID: mod.workshopID,
					reason: 'duplicate'
				});
			}
		}
	}

	addResolvedRecords(records: Iterable<WorkshopInventoryResolvedRecord>) {
		for (const { mod, source } of records) {
			const result = this.addResolvedMod(mod, source);
			if (result === 'discarded-duplicate' && mod.workshopID !== undefined) {
				this.recordUnresolvedWorkshopItem({
					workshopID: mod.workshopID,
					reason: 'duplicate'
				});
			}
		}
	}

	recordUnresolvedWorkshopItem(item: UnresolvedWorkshopItem) {
		appendUniqueUnresolvedWorkshopItem(this.unresolvedWorkshopItems, item);
	}

	addUnresolvedWorkshopItems(items: Iterable<UnresolvedWorkshopItem>) {
		for (const item of items) {
			this.recordUnresolvedWorkshopItem(item);
		}
	}

	recordMetadataFailures(workshopIDs: Iterable<bigint>) {
		for (const workshopID of workshopIDs) {
			this.recordUnresolvedWorkshopItem({
				workshopID,
				reason: 'metadata-failed'
			});
		}
	}

	addResolvedModsForRequestedWorkshopIDs(
		mods: Iterable<ModData>,
		requestedWorkshopIDs: Iterable<bigint>,
		source: WorkshopInventoryItemSource = 'subscribed'
	) {
		const modList = [...mods];
		const missingWorkshopIDs = new Set(requestedWorkshopIDs);
		for (const mod of modList) {
			if (mod.workshopID !== undefined) {
				missingWorkshopIDs.delete(mod.workshopID);
			}
		}
		this.addResolvedMods(modList, source);
		for (const workshopID of missingWorkshopIDs) {
			this.recordUnresolvedWorkshopItem({
				workshopID,
				reason: 'hydration-failed'
			});
		}
	}

	applyWorkshopModBuildOutcome(outcome: WorkshopModBuildOutcome, source: WorkshopInventoryItemSource = 'subscribed') {
		this.addUnresolvedWorkshopItems(outcome.unresolvedWorkshopItems);
		this.addResolvedMods(outcome.mods, source);
	}

	queueMissingDependenciesFromResolvedMods(): Set<bigint> {
		return this.queueMissingDependencies(this.getResolvedWorkshopModMap().values());
	}

	getUnresolvedWorkshopItems(): UnresolvedWorkshopItem[] {
		return [...this.unresolvedWorkshopItems];
	}

	createScanOutcome(stats: WorkshopInventoryScanOutcome['stats']): WorkshopInventoryScanOutcome {
		return {
			mods: this.getWorkshopMods(),
			stats,
			unresolvedWorkshopItems: this.getUnresolvedWorkshopItems()
		};
	}

	collectMissingDependencies(mods: Iterable<ModData>): Set<bigint> {
		return collectMissingWorkshopDependencies(mods, this.getResolvedWorkshopModMap(), this.knownInvalidMods, this.options);
	}

	queueMissingDependencies(mods: Iterable<ModData>): Set<bigint> {
		const missingDependencies = this.collectMissingDependencies(mods);
		missingDependencies.forEach((workshopID) => {
			this.pendingWorkshopMods.add(workshopID);
		});
		return missingDependencies;
	}

	getPendingWorkshopMods(): Set<bigint> {
		return new Set(this.pendingWorkshopMods);
	}

	hasPendingWorkshopMods(): boolean {
		return this.pendingWorkshopMods.size > 0;
	}

	getKnownInvalidWorkshopMods(): Set<bigint> {
		return new Set(this.knownInvalidMods);
	}

	getResolvedWorkshopModCount(): number {
		return this.recordsByWorkshopID.size;
	}

	markPendingWorkshopModsInvalid(): Set<bigint> {
		const invalidWorkshopMods = this.getPendingWorkshopMods();
		invalidWorkshopMods.forEach((workshopID) => {
			this.knownInvalidMods.add(workshopID);
		});
		this.pendingWorkshopMods.clear();
		return invalidWorkshopMods;
	}

	replacePendingWorkshopMods(workshopIDs: Iterable<bigint>) {
		this.pendingWorkshopMods.clear();
		const workshopMap = this.getResolvedWorkshopModMap();
		for (const workshopID of workshopIDs) {
			if (!workshopMap.has(workshopID) && !this.knownInvalidMods.has(workshopID)) {
				this.pendingWorkshopMods.add(workshopID);
			}
		}
	}

	getWorkshopMods(): ModData[] {
		return [...this.recordsByWorkshopID.values()].map((record) => record.mod);
	}
}

export function getWorkshopInventorySourceForKnownItem(
	workshopID: bigint,
	knownWorkshopMods: Set<bigint>,
	defaultSource: WorkshopInventoryItemSource = 'subscribed'
): WorkshopInventoryItemSource {
	return knownWorkshopMods.has(workshopID) ? 'known' : defaultSource;
}

export const buildWorkshopModBatch = Effect.fnUntraced(function* (
	steamDetails: SteamUGCDetails[],
	buildWorkshopMod: BuildWorkshopMod,
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
				Effect.catch(() => {
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

function getWorkshopInventoryPageItemIDs(page: WorkshopInventorySubscribedPage) {
	return new Set(page.itemIDs ?? page.items.map((item) => item.publishedFileId));
}

export function createWorkshopInventorySubscribedPageTransition(
	knownWorkshopMods: Set<bigint>,
	observation: WorkshopInventorySubscribedPageObservation
) {
	const resolvedRecords = [...observation.builtPageMods.mods, ...observation.missingDetailMods.mods].flatMap((mod) => {
		if (mod.workshopID === undefined) {
			return [];
		}
		const source = getWorkshopInventorySourceForKnownItem(mod.workshopID, knownWorkshopMods);
		return [{ mod, source }];
	});
	return {
		progressEffect: { type: 'set-workshop-total', total: observation.page.totalItems } satisfies WorkshopInventoryProgressEffect,
		resolvedRecords,
		subscribedItems: observation.page.numReturned,
		unresolvedWorkshopItems: [
			...observation.builtPageMods.unresolvedWorkshopItems,
			...observation.missingDetailMods.unresolvedWorkshopItems
		]
	};
}

export function applyWorkshopInventorySubscribedPageTransition(
	expansion: WorkshopInventoryExpansion,
	transition: WorkshopInventorySubscribedPageTransition
) {
	expansion.addUnresolvedWorkshopItems(transition.unresolvedWorkshopItems);
	expansion.addResolvedRecords(transition.resolvedRecords);
}

const buildWorkshopModsForMissingDetails = Effect.fnUntraced(function* (
	requestedWorkshopIDs: Set<bigint>,
	details: SteamUGCDetails[],
	buildWorkshopMod: BuildWorkshopMod,
	knownWorkshopMods: Set<bigint>
): Effect.fn.Return<WorkshopModBuildOutcome, unknown, SteamPersonaCache> {
	const detailIDs = new Set(details.map((item) => item.publishedFileId));
	const missingWorkshopIDs = [...requestedWorkshopIDs].filter((workshopID) => !detailIDs.has(workshopID));
	const mods = yield* Effect.forEach(
		missingWorkshopIDs,
		(workshopID) =>
			buildWorkshopMod(workshopID, undefined, knownWorkshopMods.has(workshopID)).pipe(
				Effect.map((mod) => ({ mod, workshopID })),
				Effect.catch(() => Effect.succeed({ mod: null, workshopID }))
			),
		{ concurrency: 'unbounded' }
	);
	return {
		mods: mods.flatMap(({ mod }) => (mod ? [mod] : [])),
		unresolvedWorkshopItems: mods.flatMap(({ mod, workshopID }) => (mod ? [] : [{ workshopID, reason: 'metadata-failed' as const }]))
	};
});

export const scanWorkshopInventoryExpansion = Effect.fnUntraced(function* ({
	buildWorkshopMod,
	fetchSubscribedPage,
	getDetailsForWorkshopModList,
	knownWorkshopMods,
	logDebug,
	onProgressEffect,
	options
}: WorkshopInventoryExpansionScanInput): Effect.fn.Return<WorkshopInventoryScanOutcome, unknown, SteamPersonaCache> {
	const explicitKnownWorkshopMods = new Set(knownWorkshopMods);
	const expansion = new WorkshopInventoryExpansion(explicitKnownWorkshopMods, new Map(), new Set(), options);
	let subscribedItems = 0;

	for (let pageNumber = 1, lastProcessed = 1; lastProcessed > 0; pageNumber += 1) {
		const page = yield* fetchSubscribedPage(pageNumber);
		const requestedWorkshopIDs = getWorkshopInventoryPageItemIDs(page);
		lastProcessed = page.numReturned;
		logDebug?.(`Total items: ${page.totalItems}, Returned by Steam: ${page.numReturned}, Processed this chunk: ${page.items.length}`);

		const builtPageMods = yield* buildWorkshopModBatch(page.items, buildWorkshopMod, (workshopID) =>
			explicitKnownWorkshopMods.has(workshopID)
		);
		const missingDetailMods = yield* buildWorkshopModsForMissingDetails(
			requestedWorkshopIDs,
			page.items,
			buildWorkshopMod,
			explicitKnownWorkshopMods
		);
		const pageTransition = createWorkshopInventorySubscribedPageTransition(explicitKnownWorkshopMods, {
			builtPageMods,
			missingDetailMods,
			page
		});
		applyWorkshopInventorySubscribedPageTransition(expansion, pageTransition);
		onProgressEffect?.(pageTransition.progressEffect);
		subscribedItems += pageTransition.subscribedItems;
	}

	expansion.queueMissingDependenciesFromResolvedMods();
	if (expansion.getResolvedWorkshopModCount() !== subscribedItems) {
		logDebug?.(
			`Steam returned ${subscribedItems} subscribed workshop entries, ` +
				`but loaded ${expansion.getResolvedWorkshopModCount()} valid unique mods. ` +
				'Filtered or duplicate entries are expected to make these counts differ.'
		);
	}

	const dependencyItems = yield* expandPendingWorkshopDependencies(expansion, {
		adapters: {
			getDetailsForWorkshopModList,
			keepUnknownWorkshopItem: () => true,
			knownWorkshopMods: explicitKnownWorkshopMods,
			options
		},
		onProgressEffect
	});

	return expansion.createScanOutcome({
		dependencyItems,
		knownItems: explicitKnownWorkshopMods.size,
		subscribedItems
	});
});

const resolveWorkshopDependencyChunkOutcome = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<WorkshopDependencyChunkOutcome, unknown, SteamPersonaCache> {
	const modChunks = chunkWorkshopIds([...modList]);

	const expansion = new WorkshopInventoryExpansion(modList, workshopMap, knownInvalidMods, adapters.options);
	const modDependencies: Set<bigint> = new Set();
	const resolvedRecords: WorkshopInventoryResolvedRecord[] = [];

	for (let i = 0; i < modChunks.length; i++) {
		const requestedWorkshopIDs = new Set(modChunks[i]);
		let metadataFailed = false;
		const modDetails = yield* adapters
			.getDetailsForWorkshopModList(
				modChunks[i],
				(workshopID) => adapters.keepUnknownWorkshopItem?.(workshopID) ?? adapters.knownWorkshopMods.has(workshopID)
			)
			.pipe(
				Effect.catch(() => {
					adapters.onProgressEffect?.({ type: 'increment-loaded-mods', count: modChunks[i].length });
					metadataFailed = true;
					return Effect.succeed<ModData[]>([]);
				})
			);
		if (metadataFailed) {
			expansion.recordMetadataFailures(requestedWorkshopIDs);
			continue;
		}
		const chunkResolvedRecords: WorkshopInventoryResolvedRecord[] = [];
		modDetails.forEach((mod: ModData) => {
			if (mod.workshopID !== undefined) {
				requestedWorkshopIDs.delete(mod.workshopID);
				chunkResolvedRecords.push({
					mod,
					source: getWorkshopInventorySourceForKnownItem(mod.workshopID, adapters.knownWorkshopMods, 'dependency')
				});
			}
		});
		resolvedRecords.push(...chunkResolvedRecords);
		expansion.addResolvedRecords(chunkResolvedRecords);
		for (const workshopID of requestedWorkshopIDs) {
			expansion.recordUnresolvedWorkshopItem({
				workshopID,
				reason: 'hydration-failed'
			});
		}

		expansion.collectMissingDependencies(modDetails).forEach((missingDependency) => modDependencies.add(missingDependency));
	}

	return {
		missingDependencies: modDependencies,
		resolvedRecords,
		unresolvedWorkshopItems: expansion.getUnresolvedWorkshopItems()
	};
});

export const resolveWorkshopDependencyChunk = Effect.fnUntraced(function* (
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint>,
	modList: Set<bigint>,
	adapters: WorkshopDependencyExpansionAdapters
): Effect.fn.Return<Set<bigint>, unknown, SteamPersonaCache> {
	const outcome = yield* resolveWorkshopDependencyChunkOutcome(workshopMap, knownInvalidMods, modList, adapters);
	const expansion = new WorkshopInventoryExpansion(modList, workshopMap, knownInvalidMods, adapters.options);
	expansion.addResolvedRecords(outcome.resolvedRecords);
	workshopMap.clear();
	expansion.getResolvedWorkshopModMap().forEach((mod, workshopID) => {
		workshopMap.set(workshopID, mod);
	});
	return outcome.missingDependencies;
});

export const expandPendingWorkshopDependencies = Effect.fnUntraced(function* (
	expansion: WorkshopInventoryExpansion,
	{ adapters, onProgressEffect }: WorkshopInventoryDependencyExpansionOptions
): Effect.fn.Return<number, unknown, SteamPersonaCache> {
	let dependencyItems = 0;
	let missingKnownWorkshopMods = expansion.getPendingWorkshopMods();

	while (expansion.hasPendingWorkshopMods()) {
		onProgressEffect?.({ type: 'increment-workshop-total', count: missingKnownWorkshopMods.size });
		dependencyItems += missingKnownWorkshopMods.size;

		const dependencyWorkshopMap = expansion.getResolvedWorkshopModMap();
		const dependencyChunkOutcome = yield* resolveWorkshopDependencyChunkOutcome(
			dependencyWorkshopMap,
			expansion.getKnownInvalidWorkshopMods(),
			missingKnownWorkshopMods,
			{
				...adapters,
				onProgressEffect
			}
		);
		expansion.addUnresolvedWorkshopItems(dependencyChunkOutcome.unresolvedWorkshopItems);
		expansion.addResolvedRecords(dependencyChunkOutcome.resolvedRecords);
		missingKnownWorkshopMods = dependencyChunkOutcome.missingDependencies;
		expansion.markPendingWorkshopModsInvalid().forEach((workshopID) => {
			if (hasUnresolvedWorkshopItem(expansion.getUnresolvedWorkshopItems(), workshopID)) {
				return;
			}
			expansion.recordUnresolvedWorkshopItem({
				workshopID,
				reason: 'hydration-failed'
			});
		});
		expansion.replacePendingWorkshopMods(missingKnownWorkshopMods);
	}

	return dependencyItems;
});

import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { collectMissingWorkshopDependencies } from './mod-workshop-dependencies';
import { chunkWorkshopIds } from './mod-workshop-metadata';
import { WorkshopDependencyQueueState } from './workshop-dependency-queue-state';
import { getWorkshopInventorySourceForKnownItem, shouldPreferWorkshopInventoryRecord } from './workshop-inventory-source-policy';
import type {
	UnresolvedWorkshopItem,
	WorkshopDependencyEffect,
	WorkshopDependencyObservation,
	WorkshopInventoryItemSource,
	WorkshopInventoryResolvedRecord,
	WorkshopInventoryScanOutcome,
	WorkshopModBuildOutcome
} from './workshop-inventory-types';
import { appendUniqueUnresolvedWorkshopItem } from './workshop-inventory-unresolved-policy';

export class WorkshopInventoryExpansion {
	private readonly recordsByWorkshopID: Map<bigint, WorkshopInventoryResolvedRecord>;

	private readonly unresolvedWorkshopItems: UnresolvedWorkshopItem[];

	private readonly dependencyQueue: WorkshopDependencyQueueState;

	private dependencyChunks: bigint[][] = [];

	private dependencyChunk: bigint[] = [];

	private discoveredDependencies = new Set<bigint>();

	private dependencyItems = 0;

	readonly options: NuterraSteamCompatibilityOptions;

	constructor(
		pendingWorkshopMods: Set<bigint> = new Set(),
		workshopMap: Map<bigint, ModData> = new Map(),
		knownInvalidMods: Set<bigint> = new Set(),
		options: NuterraSteamCompatibilityOptions = {},
		unresolvedWorkshopItems: UnresolvedWorkshopItem[] = []
	) {
		this.dependencyQueue = new WorkshopDependencyQueueState(pendingWorkshopMods, knownInvalidMods);
		this.options = options;
		this.unresolvedWorkshopItems = [...unresolvedWorkshopItems];
		this.recordsByWorkshopID = new Map(
			[...workshopMap.entries()].map(([workshopID, mod]) => [
				workshopID,
				{ mod, source: 'subscribed' } satisfies WorkshopInventoryResolvedRecord
			])
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
		this.dependencyQueue.deleteResolvedWorkshopID(workshopID);

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
		return collectMissingWorkshopDependencies(
			mods,
			this.getResolvedWorkshopModMap(),
			this.dependencyQueue.getKnownInvalidWorkshopMods(),
			this.options
		);
	}

	queueMissingDependencies(mods: Iterable<ModData>): Set<bigint> {
		const missingDependencies = this.collectMissingDependencies(mods);
		return this.dependencyQueue.queueWorkshopIDs(missingDependencies);
	}

	getPendingWorkshopMods(): Set<bigint> {
		return this.dependencyQueue.getPendingWorkshopMods();
	}

	hasPendingWorkshopMods(): boolean {
		return this.dependencyQueue.hasPendingWorkshopMods();
	}

	getKnownInvalidWorkshopMods(): Set<bigint> {
		return this.dependencyQueue.getKnownInvalidWorkshopMods();
	}

	getResolvedWorkshopModCount(): number {
		return this.recordsByWorkshopID.size;
	}

	completeDependencyQueuePass(workshopIDs: Iterable<bigint>): UnresolvedWorkshopItem[] {
		const emittedItems = this.dependencyQueue.completePass(workshopIDs, this.getResolvedWorkshopModMap(), this.unresolvedWorkshopItems);
		this.addUnresolvedWorkshopItems(emittedItems);
		return emittedItems;
	}

	startDependencyExpansion(): WorkshopDependencyEffect[] {
		this.dependencyItems = 0;
		this.dependencyQueue.filterPendingWorkshopMods(this.getResolvedWorkshopModMap());
		return this.startDependencyPass();
	}

	private startDependencyPass(): WorkshopDependencyEffect[] {
		const pending = this.getPendingWorkshopMods();
		if (pending.size === 0) {
			return [{ type: 'dependency-expansion-complete', dependencyItems: this.dependencyItems }];
		}
		this.dependencyItems += pending.size;
		this.discoveredDependencies = new Set();
		this.dependencyChunks = chunkWorkshopIds([...pending]);
		this.dependencyChunk = this.dependencyChunks.shift()!;
		return [
			{ type: 'increment-workshop-total', count: pending.size },
			{ type: 'fetch-dependency-chunk', workshopIDs: this.dependencyChunk }
		];
	}

	observeDependencyChunk(observation: WorkshopDependencyObservation, knownWorkshopMods: Set<bigint>): WorkshopDependencyEffect[] {
		const requested = new Set(this.dependencyChunk);
		const effects: WorkshopDependencyEffect[] = [];
		if (observation.type === 'metadata-failed') {
			this.recordMetadataFailures(requested);
			effects.push({ type: 'increment-loaded-mods', count: requested.size });
		} else {
			const records = observation.mods.flatMap((mod) => {
				if (mod.workshopID === undefined) return [];
				requested.delete(mod.workshopID);
				return [{ mod, source: getWorkshopInventorySourceForKnownItem(mod.workshopID, knownWorkshopMods, 'dependency') }];
			});
			this.addResolvedRecords(records);
			for (const workshopID of requested) {
				this.recordUnresolvedWorkshopItem({ workshopID, reason: 'hydration-failed' });
			}
			for (const id of this.collectMissingDependencies(observation.mods)) this.discoveredDependencies.add(id);
		}
		const nextChunk = this.dependencyChunks.shift();
		if (nextChunk) {
			this.dependencyChunk = nextChunk;
			effects.push({ type: 'fetch-dependency-chunk', workshopIDs: nextChunk });
		} else {
			this.completeDependencyQueuePass(this.discoveredDependencies);
			effects.push(...this.startDependencyPass());
		}
		return effects;
	}

	getWorkshopMods(): ModData[] {
		return [...this.recordsByWorkshopID.values()].map((record) => record.mod);
	}
}

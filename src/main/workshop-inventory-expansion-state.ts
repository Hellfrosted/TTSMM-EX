import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { collectMissingWorkshopDependencies } from './mod-workshop-dependencies';
import { shouldPreferWorkshopInventoryRecord } from './workshop-inventory-source-policy';
import type {
	UnresolvedWorkshopItem,
	WorkshopInventoryItemSource,
	WorkshopInventoryResolvedRecord,
	WorkshopInventoryScanOutcome,
	WorkshopModBuildOutcome
} from './workshop-inventory-types';
import { appendUniqueUnresolvedWorkshopItem } from './workshop-inventory-unresolved-policy';

export class WorkshopInventoryExpansion {
	private readonly recordsByWorkshopID: Map<bigint, WorkshopInventoryResolvedRecord>;

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

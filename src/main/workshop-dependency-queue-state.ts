import type { ModData } from '../model';
import type { UnresolvedWorkshopItem } from './workshop-inventory-types';
import { hasUnresolvedWorkshopItem } from './workshop-inventory-unresolved-policy';

export class WorkshopDependencyQueueState {
	private readonly knownInvalidMods: Set<bigint>;

	private readonly pendingWorkshopMods: Set<bigint>;

	constructor(pendingWorkshopMods: Iterable<bigint> = [], knownInvalidMods: Iterable<bigint> = []) {
		this.pendingWorkshopMods = new Set(pendingWorkshopMods);
		this.knownInvalidMods = new Set(knownInvalidMods);
	}

	deleteResolvedWorkshopID(workshopID: bigint) {
		this.pendingWorkshopMods.delete(workshopID);
		this.knownInvalidMods.delete(workshopID);
	}

	queueWorkshopIDs(workshopIDs: Iterable<bigint>): Set<bigint> {
		const queuedWorkshopIDs = new Set(workshopIDs);
		queuedWorkshopIDs.forEach((workshopID) => {
			this.pendingWorkshopMods.add(workshopID);
		});
		return queuedWorkshopIDs;
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

	completePass(
		nextWorkshopIDs: Iterable<bigint>,
		resolvedWorkshopMods: Map<bigint, ModData>,
		unresolvedWorkshopItems: readonly UnresolvedWorkshopItem[]
	): UnresolvedWorkshopItem[] {
		const terminalWorkshopIDs = this.drainPendingWorkshopModsAsInvalid();
		const emittedItems: UnresolvedWorkshopItem[] = [];

		terminalWorkshopIDs.forEach((workshopID) => {
			if (!hasUnresolvedWorkshopItem(unresolvedWorkshopItems, workshopID)) {
				emittedItems.push({
					workshopID,
					reason: 'hydration-failed'
				});
			}
		});

		this.replacePendingWorkshopMods(nextWorkshopIDs, resolvedWorkshopMods);
		return emittedItems;
	}

	private drainPendingWorkshopModsAsInvalid(): Set<bigint> {
		const terminalWorkshopIDs = this.getPendingWorkshopMods();
		terminalWorkshopIDs.forEach((workshopID) => {
			this.knownInvalidMods.add(workshopID);
		});
		this.pendingWorkshopMods.clear();
		return terminalWorkshopIDs;
	}

	private replacePendingWorkshopMods(workshopIDs: Iterable<bigint>, resolvedWorkshopMods: Map<bigint, ModData>) {
		this.pendingWorkshopMods.clear();
		for (const workshopID of workshopIDs) {
			if (!resolvedWorkshopMods.has(workshopID) && !this.knownInvalidMods.has(workshopID)) {
				this.pendingWorkshopMods.add(workshopID);
			}
		}
	}
}

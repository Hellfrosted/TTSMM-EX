import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import { collectMissingWorkshopDependencies } from './mod-workshop-dependencies';

export class WorkshopInventoryResolver {
	readonly workshopMap: Map<bigint, ModData>;

	readonly pendingWorkshopMods: Set<bigint>;

	readonly knownInvalidMods: Set<bigint>;

	readonly options: NuterraSteamCompatibilityOptions;

	constructor(
		pendingWorkshopMods: Set<bigint> = new Set(),
		workshopMap: Map<bigint, ModData> = new Map(),
		knownInvalidMods: Set<bigint> = new Set(),
		options: NuterraSteamCompatibilityOptions = {}
	) {
		this.pendingWorkshopMods = pendingWorkshopMods;
		this.workshopMap = workshopMap;
		this.knownInvalidMods = knownInvalidMods;
		this.options = options;
	}

	addResolvedMod(mod: ModData) {
		const workshopID = mod.workshopID;
		if (workshopID === undefined) {
			return;
		}
		this.pendingWorkshopMods.delete(workshopID);
		this.knownInvalidMods.delete(workshopID);
		this.workshopMap.set(workshopID, mod);
	}

	addResolvedMods(mods: Iterable<ModData>) {
		for (const mod of mods) {
			this.addResolvedMod(mod);
		}
	}

	collectMissingDependencies(mods: Iterable<ModData>): Set<bigint> {
		return collectMissingWorkshopDependencies(mods, this.workshopMap, this.knownInvalidMods, this.options);
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
		for (const workshopID of workshopIDs) {
			if (!this.workshopMap.has(workshopID) && !this.knownInvalidMods.has(workshopID)) {
				this.pendingWorkshopMods.add(workshopID);
			}
		}
	}

	getWorkshopMods(): ModData[] {
		return [...this.workshopMap.values()];
	}
}

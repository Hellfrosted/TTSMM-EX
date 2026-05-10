import { type ModData, getModDataId } from './Mod';
import { createNuterraSteamBetaMatchingPolicy, type NuterraSteamCompatibilityOptions } from './nuterrasteam-compatibility';

interface ModDependencyTarget {
	name?: string;
	workshopID?: bigint;
}

export interface ModDependencyTargetSatisfactionPolicy {
	getEquivalentDependencyIdForTarget(target: ModDependencyTarget): string | undefined;
	isDependencyTargetSatisfiedByMod(target: ModDependencyTarget, mod: ModData): boolean;
}

export function createModDependencyTargetSatisfactionPolicy(
	options: NuterraSteamCompatibilityOptions = {}
): ModDependencyTargetSatisfactionPolicy {
	const nuterraSteamPolicy = createNuterraSteamBetaMatchingPolicy(options);

	function getEquivalentDependencyIdForTarget(target: ModDependencyTarget): string | undefined {
		if (target.workshopID) {
			const equivalentWorkshopDependencyId = nuterraSteamPolicy.getEquivalentDependencyIdForWorkshopId(target.workshopID);
			if (equivalentWorkshopDependencyId) {
				return equivalentWorkshopDependencyId;
			}
		}

		return nuterraSteamPolicy.normalizeDependencyId(target.name);
	}

	function isDependencyTextSatisfiedByMod(dependencyText: string | undefined, mod: ModData) {
		if (!dependencyText) {
			return false;
		}

		return (
			nuterraSteamPolicy.areDependencyTextsEquivalent(dependencyText, getModDataId(mod)) ||
			nuterraSteamPolicy.areDependencyTextsEquivalent(dependencyText, mod.name)
		);
	}

	function isDependencyTargetSatisfiedByMod(target: ModDependencyTarget, mod: ModData): boolean {
		if (target.workshopID && mod.workshopID === target.workshopID) {
			return true;
		}

		if (target.workshopID && nuterraSteamPolicy.isWorkshopDependencySatisfiedByMod(target.workshopID, mod)) {
			return true;
		}

		if (target.name && nuterraSteamPolicy.isWorkshopDependencyNameSatisfiedByMod(target.name, mod)) {
			return true;
		}

		return isDependencyTextSatisfiedByMod(getEquivalentDependencyIdForTarget(target), mod);
	}

	return {
		getEquivalentDependencyIdForTarget,
		isDependencyTargetSatisfiedByMod
	};
}

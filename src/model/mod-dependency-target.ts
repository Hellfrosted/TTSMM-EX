import { type ModData, getModDataId } from './Mod';
import {
	NUTERRASTEAM_BETA_WORKSHOP_ID,
	NUTERRASTEAM_CANONICAL_MOD_ID,
	createNuterraSteamBetaMatchingPolicy,
	type NuterraSteamCompatibilityOptions
} from './nuterrasteam-compatibility';

interface ModDependencyTarget {
	name?: string;
	workshopID?: bigint;
}

export interface ModDependencyTargetSatisfactionPolicy {
	getEquivalentDescriptorIdForTarget(target: ModDependencyTarget): string | undefined;
	getEquivalentDependencyIdForTarget(target: ModDependencyTarget): string | undefined;
	isDependencyTargetSatisfiedByMod(target: ModDependencyTarget, mod: ModData): boolean;
}

export function createModDependencyTargetSatisfactionPolicy(
	options: NuterraSteamCompatibilityOptions = {}
): ModDependencyTargetSatisfactionPolicy {
	const nuterraSteamPolicy = createNuterraSteamBetaMatchingPolicy(options);

	function getEquivalentDependencyIdForWorkshopId(workshopID: bigint): string | undefined {
		return nuterraSteamPolicy.enabled && workshopID === NUTERRASTEAM_BETA_WORKSHOP_ID ? NUTERRASTEAM_CANONICAL_MOD_ID : undefined;
	}

	function getEquivalentDependencyIdForTarget(target: ModDependencyTarget): string | undefined {
		if (target.workshopID) {
			const equivalentWorkshopDependencyId = getEquivalentDependencyIdForWorkshopId(target.workshopID);
			if (equivalentWorkshopDependencyId) {
				return equivalentWorkshopDependencyId;
			}
		}

		return nuterraSteamPolicy.normalizeDependencyId(target.name);
	}

	function getEquivalentDescriptorIdForTarget(target: ModDependencyTarget): string | undefined {
		const equivalentDependencyId = getEquivalentDependencyIdForTarget(target);
		if (
			equivalentDependencyId !== undefined &&
			(getEquivalentDependencyIdForWorkshopId(target.workshopID ?? 0n) !== undefined || equivalentDependencyId !== target.name)
		) {
			return equivalentDependencyId;
		}
		return undefined;
	}

	function isWorkshopDependencyNameSatisfiedByMod(dependencyName: string | undefined | null, mod: ModData): boolean {
		if (!nuterraSteamPolicy.enabled || !nuterraSteamPolicy.isVariantText(dependencyName)) {
			return false;
		}
		return nuterraSteamPolicy.isModVariant(mod);
	}

	function isWorkshopDependencySatisfiedByMod(workshopID: bigint, mod: ModData): boolean {
		if (mod.workshopID === workshopID) {
			return true;
		}
		return getEquivalentDependencyIdForWorkshopId(workshopID) !== undefined && nuterraSteamPolicy.isModVariant(mod);
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

		if (target.workshopID && isWorkshopDependencySatisfiedByMod(target.workshopID, mod)) {
			return true;
		}

		if (target.name && isWorkshopDependencyNameSatisfiedByMod(target.name, mod)) {
			return true;
		}

		return isDependencyTextSatisfiedByMod(getEquivalentDependencyIdForTarget(target), mod);
	}

	return {
		getEquivalentDescriptorIdForTarget,
		getEquivalentDependencyIdForTarget,
		isDependencyTargetSatisfiedByMod
	};
}

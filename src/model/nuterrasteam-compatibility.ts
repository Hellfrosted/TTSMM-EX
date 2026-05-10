import type { ModData } from './Mod';
import { getModDataId } from './Mod';

export const NUTERRASTEAM_BETA_WORKSHOP_ID = BigInt(2790966966);
export const NUTERRASTEAM_CANONICAL_MOD_ID = 'NuterraSteam';

export interface NuterraSteamCompatibilityOptions {
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

export interface NuterraSteamBetaMatchingPolicy {
	readonly enabled: boolean;
	areDependencyTextsEquivalent(left: string | undefined | null, right: string | undefined | null): boolean;
	isModVariant(mod: ModData): boolean;
	isVariantText(value: string | undefined | null): boolean;
	getEquivalentDependencyIdForWorkshopId(workshopID: bigint): string | undefined;
	isWorkshopDependencyNameSatisfiedByMod(dependencyName: string | undefined | null, mod: ModData): boolean;
	isWorkshopDependencySatisfiedByMod(workshopID: bigint, mod: ModData): boolean;
	normalizeDependencyId(modID: string | undefined | null): string | undefined;
}

function isNuterraSteamVariantText(value: string | undefined | null): boolean {
	if (!value) {
		return false;
	}

	const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
	return normalized === 'nuterrasteam' || normalized === 'nuterrasteambeta';
}

function isNuterraSteamCompatibilityEnabled(options: NuterraSteamCompatibilityOptions = {}): boolean {
	return options.treatNuterraSteamBetaAsEquivalent !== false;
}

export function createNuterraSteamBetaMatchingPolicy(options: NuterraSteamCompatibilityOptions = {}): NuterraSteamBetaMatchingPolicy {
	const enabled = isNuterraSteamCompatibilityEnabled(options);

	function normalizeDependencyId(modID: string | undefined | null): string | undefined {
		if (!modID) {
			return undefined;
		}
		if (enabled && isNuterraSteamVariantText(modID)) {
			return NUTERRASTEAM_CANONICAL_MOD_ID;
		}
		return modID;
	}

	function areDependencyTextsEquivalent(left: string | undefined | null, right: string | undefined | null): boolean {
		if (!left || !right) {
			return false;
		}
		return left === right || (enabled && isNuterraSteamVariantText(left) && isNuterraSteamVariantText(right));
	}

	function isModVariant(mod: ModData): boolean {
		return isNuterraSteamVariantText(getModDataId(mod)) || isNuterraSteamVariantText(mod.name);
	}

	function isWorkshopDependencyNameSatisfiedByMod(dependencyName: string | undefined | null, mod: ModData): boolean {
		if (!enabled || !isNuterraSteamVariantText(dependencyName)) {
			return false;
		}
		return isNuterraSteamVariantText(getModDataId(mod)) || isNuterraSteamVariantText(mod.name);
	}

	function getEquivalentDependencyIdForWorkshopId(workshopID: bigint): string | undefined {
		return enabled && workshopID === NUTERRASTEAM_BETA_WORKSHOP_ID ? NUTERRASTEAM_CANONICAL_MOD_ID : undefined;
	}

	function isWorkshopDependencySatisfiedByMod(workshopID: bigint, mod: ModData): boolean {
		if (mod.workshopID === workshopID) {
			return true;
		}
		return getEquivalentDependencyIdForWorkshopId(workshopID) !== undefined && isModVariant(mod);
	}

	return {
		enabled,
		areDependencyTextsEquivalent,
		getEquivalentDependencyIdForWorkshopId,
		isModVariant,
		isVariantText: isNuterraSteamVariantText,
		isWorkshopDependencyNameSatisfiedByMod,
		isWorkshopDependencySatisfiedByMod,
		normalizeDependencyId
	};
}

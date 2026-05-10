import type { ModData } from './Mod';
import { getModDataId } from './Mod';

export const NUTERRASTEAM_BETA_WORKSHOP_ID = BigInt(2790966966);

export interface NuterraSteamCompatibilityOptions {
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

export function isNuterraSteamVariantText(value: string | undefined | null): boolean {
	if (!value) {
		return false;
	}

	const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
	return normalized === 'nuterrasteam' || normalized === 'nuterrasteambeta';
}

export function isNuterraSteamCompatibilityEnabled(options: NuterraSteamCompatibilityOptions = {}): boolean {
	return options.treatNuterraSteamBetaAsEquivalent !== false;
}

export function isNuterraSteamVariantMod(mod: ModData): boolean {
	return isNuterraSteamVariantText(getModDataId(mod)) || isNuterraSteamVariantText(mod.name);
}

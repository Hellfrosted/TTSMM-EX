import type { ModData } from '../model';
import {
	isNuterraSteamCompatibilityEnabled,
	isNuterraSteamVariantMod,
	NUTERRASTEAM_BETA_WORKSHOP_ID,
	type NuterraSteamCompatibilityOptions
} from '../model';

export function collectMissingWorkshopDependencies(
	mods: Iterable<ModData>,
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint> = new Set(),
	options: NuterraSteamCompatibilityOptions = {}
): Set<bigint> {
	const modDependencies = new Set<bigint>();
	const hasNuterraSteamVariant = isNuterraSteamCompatibilityEnabled(options) && [...workshopMap.values()].some(isNuterraSteamVariantMod);
	for (const mod of mods) {
		mod.steamDependencies
			?.filter((dependency) => {
				if (hasNuterraSteamVariant && dependency === NUTERRASTEAM_BETA_WORKSHOP_ID) {
					return false;
				}
				return !workshopMap.has(dependency) && !knownInvalidMods.has(dependency);
			})
			.forEach((missingDependency) => modDependencies.add(missingDependency));
	}
	return modDependencies;
}

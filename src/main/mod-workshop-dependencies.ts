import type { ModData } from '../model';
import { createModDependencyTargetSatisfactionPolicy, type NuterraSteamCompatibilityOptions } from '../model';

export function collectMissingWorkshopDependencies(
	mods: Iterable<ModData>,
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint> = new Set(),
	options: NuterraSteamCompatibilityOptions = {}
): Set<bigint> {
	const modDependencies = new Set<bigint>();
	const policy = createModDependencyTargetSatisfactionPolicy(options);
	const loadedWorkshopMods = [...workshopMap.values()];
	for (const mod of mods) {
		mod.steamDependencies
			?.filter((dependency) => {
				if (workshopMap.has(dependency) || knownInvalidMods.has(dependency)) {
					return false;
				}
				const dependencyName = mod.steamDependencyNames?.[dependency.toString()];
				if (
					loadedWorkshopMods.some((loadedMod) =>
						policy.isDependencyTargetSatisfiedByMod({ workshopID: dependency, name: dependencyName }, loadedMod)
					)
				) {
					return false;
				}
				return true;
			})
			.forEach((missingDependency) => modDependencies.add(missingDependency));
	}
	return modDependencies;
}

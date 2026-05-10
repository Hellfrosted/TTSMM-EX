import type { ModData } from '../model';
import { createModDependencyTargetSatisfactionPolicy, type NuterraSteamCompatibilityOptions } from '../model';
import { getSteamDependencyName } from 'shared/workshop-dependency-snapshot';

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
		for (const dependency of mod.steamDependencies ?? []) {
			if (workshopMap.has(dependency) || knownInvalidMods.has(dependency)) {
				continue;
			}
			const dependencyName = getSteamDependencyName(mod.steamDependencyNames, dependency);
			if (
				loadedWorkshopMods.some((loadedMod) =>
					policy.isDependencyTargetSatisfiedByMod({ workshopID: dependency, name: dependencyName }, loadedMod)
				)
			) {
				continue;
			}
			modDependencies.add(dependency);
		}
	}
	return modDependencies;
}

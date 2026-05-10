import type { ModData } from '../model';

export function collectMissingWorkshopDependencies(
	mods: Iterable<ModData>,
	workshopMap: Map<bigint, ModData>,
	knownInvalidMods: Set<bigint> = new Set()
): Set<bigint> {
	const modDependencies = new Set<bigint>();
	for (const mod of mods) {
		mod.steamDependencies
			?.filter((dependency) => !workshopMap.has(dependency) && !knownInvalidMods.has(dependency))
			.forEach((missingDependency) => modDependencies.add(missingDependency));
	}
	return modDependencies;
}

import type Logger from 'electron-log';
import { ModData, ModDescriptor, ModType, getModDataId, getModDataDisplayName, ModDataOverride } from './Mod';
import { ModCollection } from './ModCollection';
import { CollectionErrors, ModErrors } from './CollectionValidation';
import { getCorpType } from './Corp';

type ElectronLogger = typeof Logger;

export class SessionMods {
	localPath?: string;

	foundMods: ModData[];

	modIdToModDataMap: Map<string, ModData>;

	modIdToModDescriptor: Map<string, ModDescriptor>;

	workshopIdToModDescriptor: Map<bigint, ModDescriptor>;

	constructor(localPath: string | undefined, foundMods: ModData[]) {
		this.localPath = localPath;
		this.modIdToModDataMap = new Map();
		this.modIdToModDescriptor = new Map();
		this.workshopIdToModDescriptor = new Map();
		this.foundMods = foundMods;
	}
}

function cloneModOverride(override: ModDataOverride | undefined): ModDataOverride | undefined {
	if (!override) {
		return undefined;
	}

	return {
		...override,
		tags: override.tags ? [...override.tags] : undefined
	};
}

export function cloneModData(mod: ModData): ModData {
	return {
		...mod,
		authors: mod.authors ? [...mod.authors] : undefined,
		tags: mod.tags ? [...mod.tags] : undefined,
		steamDependencies: mod.steamDependencies ? [...mod.steamDependencies] : undefined,
		steamDependencyNames: mod.steamDependencyNames ? { ...mod.steamDependencyNames } : undefined,
		explicitIDDependencies: mod.explicitIDDependencies ? [...mod.explicitIDDependencies] : undefined,
		dependsOn: mod.dependsOn ? [...mod.dependsOn] : undefined,
		isDependencyFor: mod.isDependencyFor ? [...mod.isDependencyFor] : undefined,
		overrides: cloneModOverride(mod.overrides)
	};
}

export function cloneSessionMods(session: SessionMods): SessionMods {
	return new SessionMods(
		session.localPath,
		session.foundMods.map((mod) => cloneModData(mod))
	);
}

export function getDescriptor(session: SessionMods, mod: ModData): ModDescriptor | undefined {
	let myDescriptor: ModDescriptor | undefined;
	const id = getModDataId(mod);
	if (id) {
		myDescriptor = session.modIdToModDescriptor.get(id);
	}
	if (!myDescriptor && mod.workshopID) {
		myDescriptor = session.workshopIdToModDescriptor.get(mod.workshopID);
	}
	return myDescriptor;
}

function normalizeExternalDependencyId(modID: string | undefined | null): string | undefined {
	if (!modID) {
		return undefined;
	}

	const normalizedModId = modID.replace(/[^a-z0-9]/gi, '').toLowerCase();
	// External compatibility boundary:
	// Published Workshop metadata and dependency names still appear under both
	// NuterraSteam and NuterraSteam (Beta). Internally we keep one canonical ID.
	if (normalizedModId === 'nuterrasteam' || normalizedModId === 'nuterrasteambeta') {
		return 'NuterraSteam';
	}

	return modID;
}

function createDescriptor(): ModDescriptor {
	return {
		UIDs: new Set()
	};
}

function ensureDescriptorForModId(modID: string | undefined | null, modIdToModDescriptor: Map<string, ModDescriptor>) {
	const normalizedModId = normalizeExternalDependencyId(modID);
	let descriptor = normalizedModId ? modIdToModDescriptor.get(normalizedModId) : undefined;
	if (!descriptor && normalizedModId) {
		descriptor = createDescriptor();
		descriptor.modID = normalizedModId;
	}
	if (descriptor) {
		if (normalizedModId && !descriptor.modID) {
			descriptor.modID = normalizedModId;
		}
		if (normalizedModId) {
			modIdToModDescriptor.set(normalizedModId, descriptor);
		}
	}
	return descriptor;
}

function ensureDescriptorForEquivalentName(name: string | undefined | null, modIdToModDescriptor: Map<string, ModDescriptor>) {
	const normalizedName = normalizeExternalDependencyId(name);
	if (!normalizedName || normalizedName === name) {
		return undefined;
	}

	let descriptor = modIdToModDescriptor.get(normalizedName);
	if (!descriptor) {
		descriptor = createDescriptor();
		descriptor.modID = normalizedName;
	}
	if (!descriptor.modID) {
		descriptor.modID = normalizedName;
	}
	modIdToModDescriptor.set(normalizedName, descriptor);
	return descriptor;
}

function findExistingDescriptorForModId(modID: string | undefined | null, modIdToModDescriptor: Map<string, ModDescriptor>) {
	const normalizedModId = normalizeExternalDependencyId(modID);
	return normalizedModId ? modIdToModDescriptor.get(normalizedModId) : undefined;
}

function ensureDescriptorForWorkshopId(workshopID: bigint, workshopIdToModDescriptor: Map<bigint, ModDescriptor>) {
	let descriptor = workshopIdToModDescriptor.get(workshopID);
	if (!descriptor) {
		descriptor = createDescriptor();
		descriptor.workshopID = workshopID;
		workshopIdToModDescriptor.set(workshopID, descriptor);
	}
	if (descriptor.workshopID === undefined) {
		descriptor.workshopID = workshopID;
	}
	return descriptor;
}

// This exists because IPC communication means objects must be deserialized from main to renderer
// This means that object refs are not carried over, and so relying on it as a unique ID will fail
export function setupDescriptors(session: SessionMods, overrides: Map<string, ModDataOverride>) {
	const { foundMods, modIdToModDataMap, modIdToModDescriptor, workshopIdToModDescriptor } = session;
	modIdToModDataMap.clear();
	modIdToModDescriptor.clear();
	workshopIdToModDescriptor.clear();
	foundMods.forEach((mod: ModData) => {
		mod.dependsOn = undefined;
		mod.isDependencyFor = undefined;
	});
	// Setup ModDescriptors and other maps
	foundMods.forEach((mod: ModData) => {
		const modOverrides = overrides.get(mod.uid);
		mod.overrides = cloneModOverride(modOverrides);

		modIdToModDataMap.set(mod.uid, mod);
		// Create mod descriptors using workshop mods as first pass
		if (mod.type === ModType.WORKSHOP && mod.workshopID) {
			const { workshopID } = mod;
			const id = getModDataId(mod);
			const descriptor =
				ensureDescriptorForModId(id, modIdToModDescriptor) ||
				ensureDescriptorForEquivalentName(mod.name, modIdToModDescriptor) ||
				ensureDescriptorForWorkshopId(workshopID, workshopIdToModDescriptor);
			descriptor.workshopID = workshopID;
			workshopIdToModDescriptor.set(workshopID, descriptor);

			if (!descriptor.name && mod.name) {
				descriptor.name = mod.name;
			}

			descriptor.UIDs.add(mod.uid);
		}
	});
	// Fill in mod descriptors for local mods
	foundMods.forEach((mod: ModData) => {
		if (mod.type !== ModType.WORKSHOP) {
			const id = getModDataId(mod);
			if (id) {
				const descriptor = ensureDescriptorForModId(id, modIdToModDescriptor);
				if (descriptor) {
					if (!descriptor.name && mod.name) {
						descriptor.name = mod.name;
					}
					descriptor.UIDs.add(mod.uid);
				}
			}
		}
	});

	// Setup dependency data
	const dependenciesMap: Map<ModDescriptor, Set<ModDescriptor>> = new Map();
	foundMods.forEach((mod: ModData) => {
		const myDescriptor = getDescriptor(session, mod);
		if (myDescriptor) {
			const dependencies: Set<ModDescriptor> = new Set();
			mod.steamDependencies?.forEach((workshopID) => {
				const dependencyName = mod.steamDependencyNames?.[workshopID.toString()];
				const descriptor =
					workshopIdToModDescriptor.get(workshopID) ||
					findExistingDescriptorForModId(dependencyName, modIdToModDescriptor) ||
					ensureDescriptorForWorkshopId(workshopID, workshopIdToModDescriptor);
				workshopIdToModDescriptor.set(workshopID, descriptor);
				if (dependencyName && !descriptor.name) {
					descriptor.name = dependencyName;
				}
				dependencies.add(descriptor);
			});
			mod.explicitIDDependencies?.forEach((modID) => {
				const descriptor = ensureDescriptorForModId(modID, modIdToModDescriptor);
				if (descriptor) {
					if (!descriptor.name) {
						descriptor.name = modID;
					}
					dependencies.add(descriptor);
				}
			});
			if (dependencies.size > 0) {
				mod.dependsOn = [...dependencies];
				dependencies.forEach((dependency: ModDescriptor) => {
					let reliers = dependenciesMap.get(dependency);
					if (reliers) {
						reliers.add(myDescriptor!);
					} else {
						reliers = new Set();
						reliers.add(myDescriptor!);
						dependenciesMap.set(dependency, reliers);
					}
				});
			}
		}
	});
	foundMods.forEach((mod: ModData) => {
		const myDescriptor = getDescriptor(session, mod);
		if (myDescriptor) {
			const reliers = dependenciesMap.get(myDescriptor);
			if (reliers) {
				mod.isDependencyFor = [...reliers];
			}
		}
	});
}

export function getByUID(session: SessionMods, uid: string) {
	return session.modIdToModDataMap.get(uid);
}

export function getRows(session: SessionMods): ModData[] {
	return [...session.modIdToModDataMap.values()];
}

export function filterRows(session: SessionMods, searchString: string | undefined): ModData[] {
	if (searchString && searchString.length > 0) {
		const lowerSearchString = searchString.toLowerCase();
		return getRows(session).filter((modData) => {
			if (getModDataDisplayName(modData)?.toLowerCase().includes(lowerSearchString)) {
				return true;
			}
			if (modData.type.toLowerCase().includes(lowerSearchString)) {
				return true;
			}
			if (
				modData.authors?.reduce((acc: boolean, tag: string) => {
					if (acc) {
						return true;
					}
					return tag.toLowerCase().includes(lowerSearchString);
				}, false)
			) {
				return true;
			}
			return [...(modData.tags || []), ...(modData.overrides?.tags || [])].reduce((acc: boolean, tag: string) => {
				if (acc) {
					return true;
				}
				if (tag.toLowerCase().includes(lowerSearchString)) {
					return true;
				}
				const corp = getCorpType(tag);
				if (corp !== null) {
					return corp.toString().toLowerCase().includes(lowerSearchString);
				}

				return false;
			}, false);
		});
	}
	return getRows(session);
}

function validateMod(_session: SessionMods, modData: ModData, logger?: ElectronLogger): ModErrors {
	logger?.debug(`validating ${modData.name}`);
	const thisModErrors: ModErrors = {};

	const id = getModDataId(modData);
	if ((!id || id.length <= 0) && !modData.workshopID) {
		thisModErrors.invalidId = true;
	}

	// Check subscription
	if (modData.type === ModType.WORKSHOP) {
		if (!modData.subscribed) {
			thisModErrors.notSubscribed = true;
		}
		if (modData.needsUpdate) {
			thisModErrors.needsUpdate = true;
		}
		if (!modData.installed) {
			thisModErrors.notInstalled = true;
		}
	}
	return thisModErrors;
}

export function validateCollection(session: SessionMods, collection: ModCollection, logger?: ElectronLogger): Promise<CollectionErrors> {
	return new Promise<CollectionErrors>((resolve, reject) => {
		try {
			const errors: CollectionErrors = {};
			const duplicateSelections = new Set<string>();
			const activeUidCounts = new Map<string, number>();
			collection.mods.forEach((uid) => {
				const nextCount = (activeUidCounts.get(uid) || 0) + 1;
				activeUidCounts.set(uid, nextCount);
				if (nextCount > 1) {
					duplicateSelections.add(uid);
				}
			});

			const descriptorToActiveMap: Map<ModDescriptor, string[]> = new Map();
			const presentDescriptorsList = collection.mods.map((uid) => {
				const modData = session.modIdToModDataMap.get(uid);
				if (modData) {
					const descriptor = getDescriptor(session, modData);
					if (descriptor) {
						const existingList = descriptorToActiveMap.get(descriptor);
						if (existingList) {
							existingList.push(modData.uid);
						} else {
							descriptorToActiveMap.set(descriptor, [modData.uid]);
						}
					}
					return {
						descriptor,
						modData
					};
				}
				return undefined;
			});
			const presentDescriptors: Set<ModDescriptor> = new Set(descriptorToActiveMap.keys());
			presentDescriptorsList.forEach((wrappedDescriptor, i: number) => {
				if (wrappedDescriptor) {
					const { modData, descriptor } = wrappedDescriptor;
					const modErrors: ModErrors = validateMod(session, modData, logger);

					if (descriptor) {
						// incompatibilities
						const activeForDescriptor = descriptorToActiveMap.get(descriptor)!;
						const conflictingSelections = activeForDescriptor.filter((uid) => uid !== modData.uid);
						if (duplicateSelections.has(modData.uid)) {
							conflictingSelections.push(modData.uid);
						}
						if (conflictingSelections.length > 0) {
							modErrors.incompatibleMods = [...new Set(conflictingSelections)];
						}
						// dependencies
						const dependencies = modData.dependsOn;
						if (dependencies) {
							const missingDependencies = dependencies.filter((dependency) => {
								return !presentDescriptors.has(dependency);
							});
							if (missingDependencies.length > 0) {
								modErrors.missingDependencies = missingDependencies;
							}
						}
					}

					if (Object.keys(modErrors).length > 0) {
						errors[modData.uid] = modErrors;
					}
				} else {
					errors[collection.mods[i]] = {
						invalidId: true
					};
				}
			});

			resolve(errors);
		} catch (error) {
			logger?.error('Failed to perform collection validation');
			logger?.error(error);
			reject(error);
		}
	});
}

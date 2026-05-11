import { Effect } from 'effect';
import type Logger from 'electron-log';
import { getWorkshopDependencySnapshotState } from '../shared/workshop-dependency-snapshot';
import { type CollectionErrors, type ModErrors } from './CollectionValidation';
import { getModDataId, type ModData, type ModDescriptor, ModType } from './Mod';
import { type ModCollection } from './ModCollection';
import { getDependencies, getDescriptor, type SessionMods } from './SessionMods';

type ElectronLogger = typeof Logger;

function validateMod(session: SessionMods, modData: ModData, logger?: ElectronLogger): ModErrors {
	logger?.debug(`validating ${modData.name}`);
	const thisModErrors: ModErrors = {};

	const id = getModDataId(modData);
	if ((!id || id.length <= 0) && !modData.workshopID) {
		thisModErrors.invalidId = true;
	}

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
		if (!getWorkshopDependencySnapshotState(modData).hasKnownSnapshot && getDependencies(session, modData).length > 0) {
			thisModErrors.unknownWorkshopDependencies = true;
		}
	}
	return thisModErrors;
}

export const validateCollection = Effect.fnUntraced(function* (session: SessionMods, collection: ModCollection, logger?: ElectronLogger) {
	return yield* Effect.try({
		try: () => {
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
						const activeForDescriptor = descriptorToActiveMap.get(descriptor)!;
						const conflictingSelections = activeForDescriptor.filter((uid) => uid !== modData.uid);
						if (duplicateSelections.has(modData.uid)) {
							conflictingSelections.push(modData.uid);
						}
						if (conflictingSelections.length > 0) {
							modErrors.incompatibleMods = [...new Set(conflictingSelections)];
						}

						const dependencies = getDependencies(session, modData);
						if (dependencies.length > 0) {
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

			return errors;
		},
		catch: (error) => {
			logger?.error('Failed to perform collection validation');
			logger?.error(error);
			return error;
		}
	});
});

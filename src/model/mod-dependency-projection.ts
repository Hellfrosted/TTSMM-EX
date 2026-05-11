import type { DisplayModData } from './CollectionValidation';
import { getModDescriptorDisplayName, getModDescriptorKey, type ModData, type ModDescriptor, ModType } from './Mod';
import { getDependencies, getDependents, getDescriptor, type SessionMods } from './SessionMods';

interface ModDependencyProjection {
	conflictingModData: DisplayModData[];
	dependentModData: DisplayModData[];
	requiredModData: DisplayModData[];
}

function mapDescriptorToDisplayMod(session: SessionMods, descriptor: ModDescriptor, groupedNameSuffix?: string): DisplayModData {
	const descriptorKey = getModDescriptorKey(descriptor) || 'unknown';
	const descriptorName = getModDescriptorDisplayName(descriptor);
	const descriptorRecord: DisplayModData = {
		uid: `${ModType.DESCRIPTOR}:${descriptorKey}`,
		id: descriptor.modID || null,
		workshopID: descriptor.workshopID,
		type: ModType.DESCRIPTOR,
		name: groupedNameSuffix ? `${descriptorName} ${groupedNameSuffix}` : descriptorName
	};
	const uids = descriptor.UIDs;

	if (uids.size === 0) {
		return descriptorRecord;
	}

	if (uids.size === 1) {
		const [uid] = [...uids];
		const modData = session.modIdToModDataMap.get(uid);
		if (modData) {
			return { ...modData, type: ModType.DESCRIPTOR };
		}
		return descriptorRecord;
	}

	return {
		...descriptorRecord,
		children: [...uids].map((uid) => session.modIdToModDataMap.get(uid) || { uid, id: 'INVALID', type: ModType.INVALID })
	};
}

export function createModDependencyProjection(session: SessionMods, mod: ModData): ModDependencyProjection {
	const modDescriptor = getDescriptor(session, mod);
	const requiredModData = getDependencies(session, mod).map((descriptor) => mapDescriptorToDisplayMod(session, descriptor));
	const dependentModData = getDependents(session, mod).map((descriptor) => mapDescriptorToDisplayMod(session, descriptor, 'Mod Group'));
	const conflictingModData = Array.from(modDescriptor?.UIDs || []).flatMap((uid) =>
		uid === mod.uid ? [] : [session.modIdToModDataMap.get(uid) || { uid, id: 'INVALID', type: ModType.INVALID }]
	);

	return {
		conflictingModData,
		dependentModData,
		requiredModData
	};
}

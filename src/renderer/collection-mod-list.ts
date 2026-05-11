import { getByUID, type ModCollection, type ModData, type SessionMods } from 'model';

export function getCollectionModDataList(session: SessionMods, collection: Pick<ModCollection, 'mods'> | undefined): ModData[] {
	if (!collection) {
		return [];
	}

	return collection.mods.flatMap((modUID) => {
		const modData = getByUID(session, modUID);
		return modData ? [modData] : [];
	});
}

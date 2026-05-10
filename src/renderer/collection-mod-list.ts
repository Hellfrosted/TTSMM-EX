import { type ModCollection, type ModData, type SessionMods, getByUID } from 'model';

export function getCollectionModDataList(session: SessionMods, collection: Pick<ModCollection, 'mods'> | undefined): ModData[] {
	if (!collection) {
		return [];
	}

	return collection.mods.map((modUID) => getByUID(session, modUID)).filter((modData): modData is ModData => !!modData);
}

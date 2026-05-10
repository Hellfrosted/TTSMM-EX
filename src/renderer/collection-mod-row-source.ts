import { type ModCollection, type ModData, ModType, type SessionMods, createWorkshopPlaceholderMod, getRows, parseModUid } from 'model';

export function getCollectionRows(session: SessionMods): ModData[] {
	return getRows(session);
}

function createMissingCollectionRow(uid: string): ModData {
	const parsedUid = parseModUid(uid);
	if (parsedUid?.type === ModType.WORKSHOP && /^\d+$/.test(parsedUid.id)) {
		return {
			...createWorkshopPlaceholderMod(BigInt(parsedUid.id)),
			uid
		};
	}

	return {
		uid,
		id: null,
		type: ModType.INVALID,
		name: uid,
		hasCode: false
	};
}

export function getCollectionRowsWithMissingSelections(
	session: SessionMods,
	collection: Pick<ModCollection, 'mods'> | undefined
): ModData[] {
	const rows = getCollectionRows(session);
	if (!collection) {
		return rows;
	}

	const knownRowIds = new Set(rows.map((row) => row.uid));
	const missingRows = collection.mods.filter((uid) => !knownRowIds.has(uid)).map(createMissingCollectionRow);
	return missingRows.length > 0 ? [...rows, ...missingRows] : rows;
}

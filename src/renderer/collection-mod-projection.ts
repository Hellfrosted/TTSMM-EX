import {
	type DisplayModData,
	type ModCollection,
	type ModData,
	type SessionMods,
	getByUID,
	getCorpType,
	getModDataDisplayName,
	getRows
} from 'model';

export interface CollectionSelectionState {
	selectedMods: Set<string>;
	visibleModIds: string[];
	selectedVisibleCount: number;
	allVisibleSelected: boolean;
	someVisibleSelected: boolean;
}

export function getCollectionRows(session: SessionMods): ModData[] {
	return getRows(session);
}

function includesSearchText(value: string | undefined | null, normalizedSearch: string) {
	return value?.toLowerCase().includes(normalizedSearch) ?? false;
}

function rowMatchesSearch(row: ModData, normalizedSearch: string) {
	if (includesSearchText(getModDataDisplayName(row), normalizedSearch)) {
		return true;
	}
	if (includesSearchText(row.type, normalizedSearch)) {
		return true;
	}
	if (row.authors?.some((author) => includesSearchText(author, normalizedSearch))) {
		return true;
	}

	return [...(row.tags || []), ...(row.overrides?.tags || [])].some((tag) => {
		if (includesSearchText(tag, normalizedSearch)) {
			return true;
		}

		const corp = getCorpType(tag);
		return corp !== null && includesSearchText(corp.toString(), normalizedSearch);
	});
}

export function filterCollectionRows(rows: ModData[], searchString: string | undefined): ModData[] {
	if (!searchString) {
		return rows;
	}

	const normalizedSearch = searchString.toLowerCase();
	return rows.filter((row) => rowMatchesSearch(row, normalizedSearch));
}

export function getVisibleCollectionRows(session: SessionMods, searchString: string | undefined): ModData[] {
	return filterCollectionRows(getCollectionRows(session), searchString);
}

export function getDisplayedCollectionRecord(session: SessionMods, currentRecord: ModData | undefined): ModData | undefined {
	return currentRecord ? getByUID(session, currentRecord.uid) || currentRecord : undefined;
}

export function getCollectionModDataList(session: SessionMods, collection: Pick<ModCollection, 'mods'> | undefined): ModData[] {
	if (!collection) {
		return [];
	}

	return collection.mods.map((modUID) => getByUID(session, modUID)).filter((modData): modData is ModData => !!modData);
}

export function getCollectionSelectionState(collectionMods: string[], visibleRows: DisplayModData[]): CollectionSelectionState {
	const selectedMods = new Set(collectionMods);
	const visibleModIds = visibleRows.map((modData) => modData.uid);
	const selectedVisibleCount = visibleModIds.filter((uid) => selectedMods.has(uid)).length;
	return {
		selectedMods,
		visibleModIds,
		selectedVisibleCount,
		allVisibleSelected: visibleModIds.length > 0 && selectedVisibleCount === visibleModIds.length,
		someVisibleSelected: selectedVisibleCount > 0 && selectedVisibleCount < visibleModIds.length
	};
}

export function setVisibleCollectionRowsSelected(collectionMods: string[], visibleRows: DisplayModData[], selected: boolean): Set<string> {
	const selectedMods = new Set(collectionMods);
	visibleRows.forEach((modData) => {
		if (selected) {
			selectedMods.add(modData.uid);
		} else {
			selectedMods.delete(modData.uid);
		}
	});
	return selectedMods;
}

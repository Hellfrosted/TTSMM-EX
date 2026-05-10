import {
	type CollectionErrors,
	type DisplayModData,
	type ModCollection,
	type ModData,
	ModType,
	type SessionMods,
	getByUID,
	getCorpDisplayName,
	getCorpType,
	getModDataDisplayId,
	getModDataDisplayName,
	getRows,
	parseModUid
} from 'model';
import { getCanonicalCollectionTagLabel } from './collection-tags';

interface CollectionSelectionState {
	selectedMods: Set<string>;
	visibleModIds: string[];
	selectedVisibleCount: number;
	allVisibleSelected: boolean;
	someVisibleSelected: boolean;
}

export function getCollectionRows(session: SessionMods): ModData[] {
	return getRows(session);
}

function createMissingCollectionRow(uid: string): ModData {
	const parsedUid = parseModUid(uid);
	if (parsedUid?.type === ModType.WORKSHOP && /^\d+$/.test(parsedUid.id)) {
		const workshopID = BigInt(parsedUid.id);
		return {
			uid,
			id: null,
			type: ModType.WORKSHOP,
			workshopID,
			name: `Workshop item ${parsedUid.id}`,
			hasCode: false
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

export function projectCollectionRowsWithErrors(rows: ModData[], errors: CollectionErrors | undefined): DisplayModData[] {
	return rows.map((row) => {
		const currentRow = row as DisplayModData;
		const nextErrors = errors?.[row.uid];
		if (currentRow.errors === nextErrors && (nextErrors || !('errors' in currentRow))) {
			return currentRow;
		}

		const { errors: _ignoredErrors, ...rowWithoutErrors } = currentRow;
		return nextErrors ? { ...rowWithoutErrors, errors: nextErrors } : rowWithoutErrors;
	});
}

function includesSearchText(value: string | undefined | null, normalizedSearch: string) {
	return value?.toLowerCase().includes(normalizedSearch) ?? false;
}

function isDisplayableTag(tag: string | undefined | null) {
	return !!tag && tag.trim().length > 0 && !/[\u0000-\u001F\u007F]/.test(tag);
}

function rowMatchesSearch(row: ModData, normalizedSearch: string) {
	if (includesSearchText(getModDataDisplayName(row), normalizedSearch)) {
		return true;
	}
	if (includesSearchText(getModDataDisplayId(row), normalizedSearch)) {
		return true;
	}
	if (includesSearchText(row.uid, normalizedSearch)) {
		return true;
	}
	if (includesSearchText(row.type, normalizedSearch)) {
		return true;
	}
	if (row.authors?.some((author) => includesSearchText(author, normalizedSearch))) {
		return true;
	}

	return [...(row.tags || []), ...(row.overrides?.tags || [])].filter(isDisplayableTag).some((tag) => {
		if (includesSearchText(tag, normalizedSearch)) {
			return true;
		}

		const corp = getCorpType(tag);
		return (
			corp !== null &&
			(includesSearchText(corp.toString(), normalizedSearch) || includesSearchText(getCorpDisplayName(corp), normalizedSearch))
		);
	});
}

export function getCollectionRowFilterTags(row: ModData) {
	return [...(row.tags || []), ...(row.overrides?.tags || [])].reduce<string[]>((tags, tag) => {
		if (!isDisplayableTag(tag) || tag.toLowerCase() === 'mods') {
			return tags;
		}
		const label = getCanonicalCollectionTagLabel(tag);
		if (!tags.some((existingTag) => existingTag.toLowerCase() === label.toLowerCase())) {
			tags.push(label);
		}
		return tags;
	}, []);
}

export function filterCollectionRowsByTags(rows: ModData[], selectedTags: readonly string[]): ModData[] {
	if (selectedTags.length === 0) {
		return rows;
	}

	const normalizedTags = selectedTags.map((tag) => tag.toLowerCase());
	return rows.filter((row) => {
		const rowTags = new Set(getCollectionRowFilterTags(row).map((tag) => tag.toLowerCase()));
		return normalizedTags.every((tag) => rowTags.has(tag));
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

export function getDisplayedCollectionRecord(
	session: SessionMods,
	currentRecord: ModData | undefined,
	errors?: CollectionErrors
): DisplayModData | undefined {
	if (!currentRecord) {
		return undefined;
	}

	const [displayedRecord] = projectCollectionRowsWithErrors([getByUID(session, currentRecord.uid) || currentRecord], errors);
	return displayedRecord;
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

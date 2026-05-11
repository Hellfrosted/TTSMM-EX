import { type DisplayModData, getModDataDisplayId, getModDataDisplayName, type ModData, type SessionMods } from 'model';
import { getCollectionRows } from './collection-mod-row-source';
import { getAllCollectionTags, getCollectionTagSearchTexts } from './collection-tags';

function includesSearchText(value: string | undefined | null, normalizedSearch: string) {
	return value?.toLowerCase().includes(normalizedSearch) ?? false;
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

	return getCollectionTagSearchTexts(row as DisplayModData).some((tag) => includesSearchText(tag, normalizedSearch));
}

export function getCollectionRowFilterTags(row: ModData) {
	return getAllCollectionTags(row as DisplayModData);
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

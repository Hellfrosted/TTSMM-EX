import type { DisplayModData } from 'model';

export interface CollectionSelectionState {
	selectedMods: Set<string>;
	visibleModIds: string[];
	selectedVisibleCount: number;
	allVisibleSelected: boolean;
	someVisibleSelected: boolean;
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

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import type { ModCollection, ModData, SessionMods } from 'model';
import { filterCollectionRows, getCollectionRowsWithMissingSelections } from 'renderer/collection-mod-projection';
import { markPerfInteraction, measurePerf } from 'renderer/perf';

interface UseCollectionRowProjectionOptions {
	collection?: ModCollection;
	mods: SessionMods;
}

function measureCollectionRows(mods: SessionMods, collection: ModCollection | undefined, search: string, label: string) {
	return measurePerf(label, () => filterCollectionRows(getCollectionRowsWithMissingSelections(mods, collection), search), {
		queryLength: search.length,
		totalMods: mods.modIdToModDataMap.size
	});
}

export function useCollectionRowProjection({ collection, mods }: UseCollectionRowProjectionOptions) {
	const [searchString, setSearchString] = useState('');
	const [filteredRows, setFilteredRows] = useState<ModData[]>();
	const searchStringRef = useRef(searchString);

	useEffect(() => {
		searchStringRef.current = searchString;
	}, [searchString]);

	const recalculateModData = useCallback(() => {
		startTransition(() => {
			const search = searchStringRef.current;
			setFilteredRows(search.length > 0 ? measureCollectionRows(mods, collection, search, 'collection.filter.recalculate') : undefined);
		});
	}, [collection, mods]);

	const updateSearch = useCallback(
		(search: string, interactionLabel: string, filterLabel: string) => {
			markPerfInteraction(interactionLabel, {
				queryLength: search.length,
				totalMods: mods.modIdToModDataMap.size
			});
			setSearchString(search);
			searchStringRef.current = search;
			startTransition(() => {
				setFilteredRows(search.length > 0 ? measureCollectionRows(mods, collection, search, filterLabel) : undefined);
			});
		},
		[collection, mods]
	);

	const onSearchChange = useCallback(
		(search: string) => {
			updateSearch(search, 'collection.search.change', 'collection.filter.searchChange');
		},
		[updateSearch]
	);

	const onSearch = useCallback(
		(search: string) => {
			updateSearch(search, 'collection.search.submit', 'collection.filter.searchSubmit');
		},
		[updateSearch]
	);

	return {
		filteredRows,
		onSearch,
		onSearchChange,
		recalculateModData,
		searchString
	};
}

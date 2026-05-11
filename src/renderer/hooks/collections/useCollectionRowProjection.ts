import type { ModCollection, ModData, SessionMods } from 'model';
import { startTransition, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { filterCollectionRows } from 'renderer/collection-mod-row-filter';
import { getCollectionRowsWithMissingSelections } from 'renderer/collection-mod-row-source';
import { markPerfInteraction, measurePerf } from 'renderer/perf';

interface UseCollectionRowProjectionOptions {
	collection?: ModCollection;
	mods: SessionMods;
}

function deriveCollectionRows(mods: SessionMods, collection: ModCollection | undefined, recalculationTick: number) {
	return measurePerf('collection.rows.derive', () => getCollectionRowsWithMissingSelections(mods, collection), {
		recalculationTick,
		totalMods: mods.modIdToModDataMap.size
	});
}

function measureCollectionRows(rows: ModData[], mods: SessionMods, search: string, label: string) {
	return measurePerf(label, () => filterCollectionRows(rows, search), {
		queryLength: search.length,
		rows: rows.length,
		totalMods: mods.modIdToModDataMap.size
	});
}

export function useCollectionRowProjection({ collection, mods }: UseCollectionRowProjectionOptions) {
	const [searchString, setSearchString] = useState('');
	const [filterMeasurementLabel, setFilterMeasurementLabel] = useState('collection.filter.rowsChange');
	const [recalculationTick, setRecalculationTick] = useState(0);
	const deferredSearchString = useDeferredValue(searchString);
	const rows = useMemo(() => deriveCollectionRows(mods, collection, recalculationTick), [collection, mods, recalculationTick]);
	const filteredRows = useMemo(
		() => (deferredSearchString.length > 0 ? measureCollectionRows(rows, mods, deferredSearchString, filterMeasurementLabel) : undefined),
		[deferredSearchString, filterMeasurementLabel, mods, rows]
	);

	const recalculateModData = useCallback(() => {
		startTransition(() => {
			setFilterMeasurementLabel('collection.filter.recalculate');
			setRecalculationTick((currentTick) => currentTick + 1);
		});
	}, []);

	const updateSearch = useCallback(
		(search: string, interactionLabel: string, filterLabel: string) => {
			markPerfInteraction(interactionLabel, {
				queryLength: search.length,
				totalMods: mods.modIdToModDataMap.size
			});
			setFilterMeasurementLabel(filterLabel);
			setSearchString(search);
		},
		[mods]
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
		rows,
		searchString
	};
}

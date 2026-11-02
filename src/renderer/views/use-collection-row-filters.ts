import { useEffect, useMemo, useState } from 'react';
import { filterCollectionRowsByTags, getCollectionRowFilterTags } from '../collection-mod-row-filter';
import type { useCollectionWorkspace } from './use-collection-workspace';

type Collections = ReturnType<typeof useCollectionWorkspace>['collections'];

export function useCollectionRowFilters({
	baseRows,
	rows,
	filteredRows,
	selectedModIds,
	searchString
}: {
	baseRows: Collections['rows'];
	rows: Collections['rows'];
	filteredRows: Collections['filteredRows'];
	selectedModIds: string[] | undefined;
	searchString: string;
}) {
	const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
	const availableFilterTags = useMemo(() => {
		const tags = new Set<string>();
		baseRows.forEach((row) => {
			getCollectionRowFilterTags(row).forEach((tag) => tags.add(tag));
		});
		return Array.from(tags).sort((left, right) => left.localeCompare(right));
	}, [baseRows]);
	useEffect(() => {
		if (selectedFilterTags.length === 0) return;
		const availableTagSet = new Set(availableFilterTags);
		setSelectedFilterTags((currentTags) => {
			const retainedTags = currentTags.filter((tag) => availableTagSet.has(tag));
			return retainedTags.length === currentTags.length ? currentTags : retainedTags;
		});
	}, [availableFilterTags, selectedFilterTags.length]);
	const visibleRows = useMemo(
		() => filterCollectionRowsByTags(filteredRows || rows, selectedFilterTags),
		[filteredRows, rows, selectedFilterTags]
	);
	const visibleSelectedCount = useMemo(() => {
		const selected = new Set(selectedModIds ?? []);
		return visibleRows.reduce((count, row) => count + (selected.has(row.uid) ? 1 : 0), 0);
	}, [selectedModIds, visibleRows]);
	const activeFilterCount = selectedFilterTags.length + (searchString.trim().length > 0 ? 1 : 0);
	return { availableFilterTags, selectedFilterTags, setSelectedFilterTags, visibleRows, visibleSelectedCount, activeFilterCount };
}

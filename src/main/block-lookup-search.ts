import type { BlockLookupSearchResult, PersistedBlockLookupIndex } from 'shared/block-lookup';
import { createBlockLookupIndexStats } from './block-lookup-index-planner';

function buildSearchBlob(record: PersistedBlockLookupIndex['records'][number]) {
	return [
		record.blockName,
		record.internalName,
		record.blockId,
		record.modTitle,
		record.workshopId,
		record.preferredAlias,
		record.fallbackAlias,
		record.spawnCommand
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

export function searchBlockLookupRecords(index: PersistedBlockLookupIndex, query: string, limit?: number): BlockLookupSearchResult {
	if (!index.builtAt) {
		return {
			rows: [],
			stats: null
		};
	}

	const normalizedQuery = query.trim().toLowerCase();
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const rows = index.records
		.filter((record) => {
			if (tokens.length === 0) {
				return true;
			}

			const blob = buildSearchBlob(record);
			return tokens.every((token) => blob.includes(token));
		})
		.sort((left, right) => {
			const leftBlock = left.blockName.toLowerCase();
			const rightBlock = right.blockName.toLowerCase();
			const leftInternal = left.internalName.toLowerCase();
			const rightInternal = right.internalName.toLowerCase();
			const leftId = left.blockId.toLowerCase();
			const rightId = right.blockId.toLowerCase();
			const leftRank = leftBlock === normalizedQuery ? 0 : leftInternal === normalizedQuery ? 1 : leftId === normalizedQuery ? 2 : 3;
			const rightRank = rightBlock === normalizedQuery ? 0 : rightInternal === normalizedQuery ? 1 : rightId === normalizedQuery ? 2 : 3;
			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}

			const leftDeprecated = leftInternal.startsWith('_deprecated_') || leftBlock.startsWith('deprecated ');
			const rightDeprecated = rightInternal.startsWith('_deprecated_') || rightBlock.startsWith('deprecated ');
			if (leftDeprecated !== rightDeprecated) {
				return leftDeprecated ? 1 : -1;
			}

			return `${left.modTitle}\0${left.blockName}`.localeCompare(`${right.modTitle}\0${right.blockName}`);
		});

	return {
		rows: limit && limit > 0 ? rows.slice(0, limit) : rows,
		stats: createBlockLookupIndexStats(index)
	};
}

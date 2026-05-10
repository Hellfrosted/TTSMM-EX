import { BLOCK_LOOKUP_SEARCH_RESULT_LIMIT, type BlockLookupSearchResult, type PersistedBlockLookupIndex } from 'shared/block-lookup';
import { createBlockLookupIndexStats } from './block-lookup-index-planner';

interface SearchableBlockLookupRecord {
	record: PersistedBlockLookupIndex['records'][number];
	blob: string;
	blockName: string;
	internalName: string;
	blockId: string;
	deprecated: boolean;
	sortLabel: string;
}

export interface WarmBlockLookupSearchIndex {
	builtAt: string;
	stats: BlockLookupSearchResult['stats'];
	records: SearchableBlockLookupRecord[];
}

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

export function createWarmBlockLookupSearchIndex(index: PersistedBlockLookupIndex): WarmBlockLookupSearchIndex | null {
	if (!index.builtAt) {
		return null;
	}

	return {
		builtAt: index.builtAt,
		stats: createBlockLookupIndexStats(index),
		records: index.records.map((record) => {
			const blockName = record.blockName.toLowerCase();
			const internalName = record.internalName.toLowerCase();
			const blockId = record.blockId.toLowerCase();
			return {
				record,
				blob: buildSearchBlob(record),
				blockName,
				internalName,
				blockId,
				deprecated: internalName.startsWith('_deprecated_') || blockName.startsWith('deprecated '),
				sortLabel: `${record.modTitle}\0${record.blockName}`
			};
		})
	};
}

export function searchWarmBlockLookupRecords(
	index: WarmBlockLookupSearchIndex | null,
	query: string,
	limit?: number
): BlockLookupSearchResult {
	if (!index) {
		return {
			rows: [],
			stats: null
		};
	}

	const normalizedQuery = query.trim().toLowerCase();
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const effectiveLimit = limit ?? (tokens.length > 0 ? BLOCK_LOOKUP_SEARCH_RESULT_LIMIT : undefined);
	const rows = index.records
		.filter((record) => {
			if (tokens.length === 0) {
				return true;
			}

			return tokens.every((token) => record.blob.includes(token));
		})
		.sort((left, right) => {
			const leftRank =
				left.blockName === normalizedQuery ? 0 : left.internalName === normalizedQuery ? 1 : left.blockId === normalizedQuery ? 2 : 3;
			const rightRank =
				right.blockName === normalizedQuery ? 0 : right.internalName === normalizedQuery ? 1 : right.blockId === normalizedQuery ? 2 : 3;
			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}

			if (left.deprecated !== right.deprecated) {
				return left.deprecated ? 1 : -1;
			}

			return left.sortLabel.localeCompare(right.sortLabel);
		})
		.map((record) => record.record);

	return {
		rows: effectiveLimit && effectiveLimit > 0 ? rows.slice(0, effectiveLimit) : rows,
		stats: index.stats
	};
}

export function searchBlockLookupRecords(index: PersistedBlockLookupIndex, query: string, limit?: number): BlockLookupSearchResult {
	return searchWarmBlockLookupRecords(createWarmBlockLookupSearchIndex(index), query, limit);
}

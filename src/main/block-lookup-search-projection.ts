import { type BlockLookupSearchResult, type BlockLookupSearchRow, type PersistedBlockLookupIndex } from 'shared/block-lookup';
import {
	type BlockLookupRecordSearchResult,
	searchBlockLookupRecordMatches,
	searchWarmBlockLookupRecordMatches,
	type WarmBlockLookupSearchIndex
} from './block-lookup-search';
import { createBlockLookupPreviewImageUrl } from './preview-protocol';

type BlockLookupSearchRecord = PersistedBlockLookupIndex['records'][number];

function createSearchRow(record: BlockLookupSearchRecord): BlockLookupSearchRow {
	const { renderedPreview, ...row } = record;
	if (!renderedPreview) {
		return row;
	}

	const imageUrl = createBlockLookupPreviewImageUrl(renderedPreview.cacheRelativePath);
	return {
		...row,
		...(imageUrl
			? {
					renderedPreview: {
						imageUrl,
						...(renderedPreview.width !== undefined ? { width: renderedPreview.width } : {}),
						...(renderedPreview.height !== undefined ? { height: renderedPreview.height } : {})
					}
				}
			: {})
	};
}

export function projectBlockLookupSearchRows(records: readonly BlockLookupSearchRecord[]): BlockLookupSearchRow[] {
	return records.map((record) => createSearchRow(record));
}

export function projectBlockLookupSearchResult(result: BlockLookupRecordSearchResult): BlockLookupSearchResult {
	return {
		rows: projectBlockLookupSearchRows(result.records),
		stats: result.stats
	};
}

export function searchWarmBlockLookupRecords(
	index: WarmBlockLookupSearchIndex | null,
	query: string,
	limit?: number
): BlockLookupSearchResult {
	return projectBlockLookupSearchResult(searchWarmBlockLookupRecordMatches(index, query, limit));
}

export function searchBlockLookupRecords(index: PersistedBlockLookupIndex, query: string, limit?: number): BlockLookupSearchResult {
	return projectBlockLookupSearchResult(searchBlockLookupRecordMatches(index, query, limit));
}

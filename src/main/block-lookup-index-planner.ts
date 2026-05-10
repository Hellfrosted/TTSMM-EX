import type { BlockLookupIndexSource, BlockLookupIndexStats, BlockLookupRecord, PersistedBlockLookupIndex } from 'shared/block-lookup';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';

interface BlockLookupIndexTask {
	source: BlockLookupSourceRecord;
	existingSource?: BlockLookupIndexSource;
	reusedRecords?: BlockLookupRecord[];
}

interface BlockLookupIndexPlan {
	removed: number;
	tasks: BlockLookupIndexTask[];
}

export function createBlockLookupIndexStats(
	index: PersistedBlockLookupIndex,
	scanned = 0,
	skipped = 0,
	removed = 0,
	updatedBlocks = 0
): BlockLookupIndexStats {
	return {
		sources: index.sources.length,
		scanned,
		skipped,
		removed,
		blocks: index.records.length,
		updatedBlocks,
		builtAt: index.builtAt || undefined
	};
}

export function createBlockLookupSourceIndexRecord(source: BlockLookupSourceRecord): BlockLookupIndexSource {
	return {
		sourcePath: source.sourcePath,
		workshopId: source.workshopId,
		modTitle: source.modTitle,
		sourceKind: source.sourceKind,
		size: source.size,
		mtimeMs: source.mtimeMs
	};
}

export function createBlockLookupIndexPlan(
	existingIndex: PersistedBlockLookupIndex,
	sources: BlockLookupSourceRecord[],
	forceRebuild = false
): BlockLookupIndexPlan {
	const existingSourceMap = new Map(existingIndex.sources.map((source) => [source.sourcePath, source]));
	const existingRecordsBySource = new Map<string, BlockLookupRecord[]>();
	(existingIndex.sourceRecords ?? existingIndex.records).forEach((record) => {
		const records = existingRecordsBySource.get(record.sourcePath) || [];
		records.push(record);
		existingRecordsBySource.set(record.sourcePath, records);
	});

	const tasks = sources.map((source) => {
		const existingSource = existingSourceMap.get(source.sourcePath);
		const unchanged = !forceRebuild && existingSource?.size === source.size && existingSource.mtimeMs === source.mtimeMs;
		return {
			source,
			existingSource,
			reusedRecords: unchanged ? existingRecordsBySource.get(source.sourcePath) || [] : undefined
		};
	});
	const seenSourcePaths = new Set(sources.map((source) => source.sourcePath));
	const removed = existingIndex.sources.filter((source) => !seenSourcePaths.has(source.sourcePath)).length;

	return {
		removed,
		tasks
	};
}

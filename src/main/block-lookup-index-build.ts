import {
	BLOCK_LOOKUP_INDEX_VERSION,
	type BlockLookupBuildRequest,
	type BlockLookupIndexSource,
	type BlockLookupIndexStats,
	type BlockLookupRecord,
	type PersistedBlockLookupIndex
} from 'shared/block-lookup';
import { createBlockLookupIndexPlan, createBlockLookupIndexStats, createBlockLookupSourceIndexRecord } from './block-lookup-index-planner';
import { collectBlockLookupSources } from './block-lookup-source-discovery';
import { indexBlockLookupSources } from './block-lookup-source-indexing';

interface BlockLookupIndexBuildAdapters {
	indexBlockLookupSources?: typeof indexBlockLookupSources;
}

interface BlockLookupIndexBuild {
	index: PersistedBlockLookupIndex;
	stats: BlockLookupIndexStats;
	workshopRoot: string;
}

const SOURCE_KIND_PRIORITY: Record<BlockLookupRecord['sourceKind'], number> = {
	json: 0,
	bundle: 1,
	vanilla: 2
};

function normalizeBlockLookupRecordIdentityPart(value: string): string {
	return value.trim().toLowerCase();
}

function createBlockLookupRecordIdIdentity(record: BlockLookupRecord): string | undefined {
	if (!record.blockId) {
		return undefined;
	}
	return [record.workshopId, record.modTitle, `id:${record.blockId}`].map(normalizeBlockLookupRecordIdentityPart).join('\0');
}

function createBlockLookupRecordNameIdentity(record: BlockLookupRecord): string {
	return [record.workshopId, record.modTitle, `name:${record.blockName}:${record.internalName}`]
		.map(normalizeBlockLookupRecordIdentityPart)
		.join('\0');
}

function shouldReplaceBlockLookupRecord(existing: BlockLookupRecord, candidate: BlockLookupRecord): boolean {
	if (existing.blockId && !candidate.blockId) {
		return false;
	}
	if (!existing.blockId && candidate.blockId) {
		return true;
	}

	const existingPriority = SOURCE_KIND_PRIORITY[existing.sourceKind];
	const candidatePriority = SOURCE_KIND_PRIORITY[candidate.sourceKind];
	if (candidatePriority !== existingPriority) {
		return candidatePriority < existingPriority;
	}
	return !existing.previewBounds && !!candidate.previewBounds;
}

function mergeBlockLookupRecordPreviewBounds(record: BlockLookupRecord, fallbackRecord: BlockLookupRecord): BlockLookupRecord {
	return !record.previewBounds && fallbackRecord.previewBounds ? { ...record, previewBounds: fallbackRecord.previewBounds } : record;
}

function dedupeBlockLookupRecords(records: readonly BlockLookupRecord[]): BlockLookupRecord[] {
	const entries: Array<{ record: BlockLookupRecord }> = [];
	const recordsById = new Map<string, { record: BlockLookupRecord }>();
	const recordsByName = new Map<string, { record: BlockLookupRecord }>();
	for (const record of records) {
		const idIdentity = createBlockLookupRecordIdIdentity(record);
		const nameIdentity = createBlockLookupRecordNameIdentity(record);
		const nameMatch = recordsByName.get(nameIdentity);
		const existingEntry =
			(idIdentity ? recordsById.get(idIdentity) : undefined) ??
			(nameMatch && (!record.blockId || !nameMatch.record.blockId || nameMatch.record.blockId === record.blockId) ? nameMatch : undefined);

		const entry = existingEntry ?? { record };
		if (!existingEntry) {
			entries.push(entry);
		} else if (shouldReplaceBlockLookupRecord(entry.record, record)) {
			entry.record = mergeBlockLookupRecordPreviewBounds(record, entry.record);
		} else {
			entry.record = mergeBlockLookupRecordPreviewBounds(entry.record, record);
		}

		const entryIdIdentity = createBlockLookupRecordIdIdentity(entry.record);
		if (entryIdIdentity) {
			recordsById.set(entryIdIdentity, entry);
		}
		recordsByName.set(createBlockLookupRecordNameIdentity(entry.record), entry);
	}
	return entries.map((entry) => entry.record);
}

export async function createBlockLookupIndexBuild(
	existingIndex: PersistedBlockLookupIndex,
	request: BlockLookupBuildRequest,
	adapters: BlockLookupIndexBuildAdapters = {}
): Promise<BlockLookupIndexBuild> {
	const indexBlockLookupSourcesImpl = adapters.indexBlockLookupSources ?? indexBlockLookupSources;
	const { sources, workshopRoot } = collectBlockLookupSources(request);
	const indexPlan = createBlockLookupIndexPlan(existingIndex, sources, request.forceRebuild);
	const nextRecords: BlockLookupRecord[] = [];
	const nextSources: BlockLookupIndexSource[] = [];
	const changedRecords: BlockLookupRecord[] = [];
	let scanned = 0;
	let skipped = 0;
	const changedSources = indexPlan.tasks.filter((task) => !task.reusedRecords).map((task) => task.source);
	const indexedSources =
		changedSources.length > 0
			? await indexBlockLookupSourcesImpl(changedSources)
			: {
					recordsBySourcePath: new Map<string, BlockLookupRecord[]>()
				};

	for (const task of indexPlan.tasks) {
		if (task.reusedRecords) {
			skipped += 1;
			nextSources.push(task.existingSource!);
			nextRecords.push(...task.reusedRecords);
			continue;
		}

		const source = task.source;
		const records = indexedSources.recordsBySourcePath.get(source.sourcePath) ?? [];
		scanned += 1;
		nextSources.push(createBlockLookupSourceIndexRecord(source));
		changedRecords.push(...records);
		nextRecords.push(...records);
	}

	const dedupedRecords = dedupeBlockLookupRecords(nextRecords);
	const dedupedChangedRecords = dedupeBlockLookupRecords(changedRecords);
	const index: PersistedBlockLookupIndex = {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: new Date().toISOString(),
		sources: nextSources,
		records: dedupedRecords,
		sourceRecords: nextRecords
	};

	return {
		index,
		stats: createBlockLookupIndexStats(index, scanned, skipped, indexPlan.removed, dedupedChangedRecords.length),
		workshopRoot
	};
}

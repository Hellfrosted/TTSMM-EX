import {
	BLOCK_LOOKUP_INDEX_VERSION,
	type BlockLookupBuildRequest,
	type BlockLookupIndexProgress,
	type BlockLookupIndexProgressCallback,
	type BlockLookupIndexProgressPhase,
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

interface BlockLookupIndexBuildOptions {
	previewCacheDir?: string;
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

const BLOCK_LOOKUP_INDEX_PROGRESS_LABELS: Record<BlockLookupIndexProgressPhase, string> = {
	planning: 'Planning index build',
	'scanning-sources': 'Scanning source changes',
	'indexing-sources': 'Extracting block records',
	finalizing: 'Finalizing indexed records',
	'writing-index': 'Writing index cache',
	complete: 'Index build complete'
};

export function createBlockLookupIndexProgress(
	phase: BlockLookupIndexProgressPhase,
	completed: number,
	total: number,
	percent: number
): BlockLookupIndexProgress {
	return {
		phase,
		phaseLabel: BLOCK_LOOKUP_INDEX_PROGRESS_LABELS[phase],
		completed: Math.max(0, completed),
		total: Math.max(0, total),
		percent: Math.max(0, Math.min(100, Math.round(percent)))
	};
}

function reportBlockLookupIndexProgress(
	onProgress: BlockLookupIndexProgressCallback | undefined,
	phase: BlockLookupIndexProgressPhase,
	completed: number,
	total: number,
	percent: number
) {
	onProgress?.(createBlockLookupIndexProgress(phase, completed, total, percent));
}

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
	if (!existing.renderedPreview && candidate.renderedPreview) {
		return true;
	}
	return !existing.previewBounds && !!candidate.previewBounds;
}

function mergeBlockLookupRecordPreview(record: BlockLookupRecord, fallbackRecord: BlockLookupRecord): BlockLookupRecord {
	return {
		...record,
		...(!record.previewBounds && fallbackRecord.previewBounds ? { previewBounds: fallbackRecord.previewBounds } : {}),
		...(!record.renderedPreview && fallbackRecord.renderedPreview ? { renderedPreview: fallbackRecord.renderedPreview } : {})
	};
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
			entry.record = mergeBlockLookupRecordPreview(record, entry.record);
		} else {
			entry.record = mergeBlockLookupRecordPreview(entry.record, record);
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
	adapters: BlockLookupIndexBuildAdapters = {},
	onProgress?: BlockLookupIndexProgressCallback,
	options: BlockLookupIndexBuildOptions = {}
): Promise<BlockLookupIndexBuild> {
	const indexBlockLookupSourcesImpl = adapters.indexBlockLookupSources ?? indexBlockLookupSources;
	reportBlockLookupIndexProgress(onProgress, 'planning', 0, 1, 0);
	const { sources, workshopRoot } = collectBlockLookupSources(request);
	const renderedPreviewsEnabled = request.renderedPreviewsEnabled === true;
	const indexPlan = createBlockLookupIndexPlan(
		existingIndex,
		sources,
		request.forceRebuild || existingIndex.renderedPreviewsEnabled !== renderedPreviewsEnabled
	);
	const nextRecords: BlockLookupRecord[] = [];
	const nextSources: BlockLookupIndexSource[] = [];
	const changedRecords: BlockLookupRecord[] = [];
	let scanned = 0;
	let skipped = 0;
	const changedSources = indexPlan.tasks.filter((task) => !task.reusedRecords).map((task) => task.source);
	reportBlockLookupIndexProgress(onProgress, 'scanning-sources', sources.length, Math.max(1, sources.length), 10);
	reportBlockLookupIndexProgress(onProgress, 'indexing-sources', 0, changedSources.length, 10);
	const indexedSources =
		changedSources.length > 0
			? renderedPreviewsEnabled
				? await indexBlockLookupSourcesImpl(changedSources, {}, { renderedPreviewsEnabled, previewCacheDir: options.previewCacheDir })
				: await indexBlockLookupSourcesImpl(changedSources)
			: {
					recordsBySourcePath: new Map<string, BlockLookupRecord[]>()
				};
	reportBlockLookupIndexProgress(onProgress, 'indexing-sources', changedSources.length, changedSources.length, 75);

	for (const [taskIndex, task] of indexPlan.tasks.entries()) {
		if (task.reusedRecords) {
			skipped += 1;
			nextSources.push(task.existingSource!);
			nextRecords.push(...task.reusedRecords);
			reportBlockLookupIndexProgress(
				onProgress,
				'finalizing',
				taskIndex + 1,
				Math.max(1, indexPlan.tasks.length),
				75 + ((taskIndex + 1) / Math.max(1, indexPlan.tasks.length)) * 20
			);
			continue;
		}

		const source = task.source;
		const records = indexedSources.recordsBySourcePath.get(source.sourcePath) ?? [];
		scanned += 1;
		nextSources.push(createBlockLookupSourceIndexRecord(source));
		changedRecords.push(...records);
		nextRecords.push(...records);
		reportBlockLookupIndexProgress(
			onProgress,
			'finalizing',
			taskIndex + 1,
			Math.max(1, indexPlan.tasks.length),
			75 + ((taskIndex + 1) / Math.max(1, indexPlan.tasks.length)) * 20
		);
	}

	const dedupedRecords = dedupeBlockLookupRecords(nextRecords);
	const dedupedChangedRecords = dedupeBlockLookupRecords(changedRecords);
	const index: PersistedBlockLookupIndex = {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: new Date().toISOString(),
		renderedPreviewsEnabled,
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

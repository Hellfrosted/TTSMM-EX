import { Effect } from 'effect';
import {
	BLOCK_LOOKUP_INDEX_VERSION,
	type BlockLookupIndexProgressCallback,
	type BlockLookupIndexSource,
	type BlockLookupIndexStats,
	type BlockLookupRecord,
	type PersistedBlockLookupIndex
} from 'shared/block-lookup';
import { extractBlockLookupBundleOutcomes } from './block-lookup-bundle-text-assets';
import { createBlockLookupIndexPlan, createBlockLookupIndexStats, createBlockLookupSourceIndexRecord } from './block-lookup-index-planner';
import { getBlockLookupSourceProgressPercent, reportBlockLookupIndexProgress } from './block-lookup-index-progress';
import { dedupeBlockLookupRecords } from './block-lookup-index-record-policy';
import {
	assignModBundleRenderedPreviewsToRecords,
	type BlockLookupRenderedPreviewBundleExtractor
} from './block-lookup-index-rendered-preview-policy';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';
import { indexBlockLookupSources } from './block-lookup-source-indexing';

interface BlockLookupIndexBuildPolicyOptions {
	readonly extractBlockLookupBundleOutcomes?: BlockLookupRenderedPreviewBundleExtractor;
	readonly forceRebuild?: boolean;
	readonly indexBlockLookupSources?: typeof indexBlockLookupSources;
	readonly onProgress?: BlockLookupIndexProgressCallback;
	readonly previewCacheDir?: string;
}

interface BlockLookupIndexBuildPolicy {
	readonly index: PersistedBlockLookupIndex;
	readonly stats: BlockLookupIndexStats;
}

function createBlockLookupSourceIndexingOptions(
	changedSources: readonly BlockLookupSourceRecord[],
	renderedPreviewsEnabled: boolean,
	options: BlockLookupIndexBuildPolicyOptions
) {
	if (!renderedPreviewsEnabled && !options.onProgress) {
		return undefined;
	}

	return {
		renderedPreviewsEnabled,
		...(renderedPreviewsEnabled && options.previewCacheDir ? { previewCacheDir: options.previewCacheDir } : {}),
		...(options.onProgress
			? {
					onIndexedSourceBatch: (completed: number, total: number) => {
						reportBlockLookupIndexProgress(
							options.onProgress,
							'indexing-sources',
							completed,
							total,
							getBlockLookupSourceProgressPercent(changedSources, completed, total, 10, renderedPreviewsEnabled ? 45 : 75),
							'sources'
						);
						if (renderedPreviewsEnabled) {
							reportBlockLookupIndexProgress(
								options.onProgress,
								'extracting-rendered-previews',
								completed,
								total,
								getBlockLookupSourceProgressPercent(changedSources, completed, total, 45, 75),
								'sources'
							);
						}
					}
				}
			: {})
	};
}

function getChangedBlockLookupSources(
	indexSources: readonly { readonly reusedRecords?: readonly BlockLookupRecord[]; readonly source: BlockLookupSourceRecord }[]
) {
	return indexSources.flatMap((task) => (task.reusedRecords ? [] : [task.source]));
}

export const createBlockLookupIndexBuildPolicy = Effect.fnUntraced(function* (
	existingIndex: PersistedBlockLookupIndex,
	sources: readonly BlockLookupSourceRecord[],
	renderedPreviewsEnabled: boolean,
	options: BlockLookupIndexBuildPolicyOptions = {}
): Effect.fn.Return<BlockLookupIndexBuildPolicy, unknown> {
	const indexBlockLookupSourcesImpl = options.indexBlockLookupSources ?? indexBlockLookupSources;
	const extractBlockLookupBundleOutcomesImpl = options.extractBlockLookupBundleOutcomes ?? extractBlockLookupBundleOutcomes;
	const indexPlan = createBlockLookupIndexPlan(
		existingIndex,
		[...sources],
		options.forceRebuild || existingIndex.renderedPreviewsEnabled !== renderedPreviewsEnabled
	);
	const nextRecords: BlockLookupRecord[] = [];
	const nextSources: BlockLookupIndexSource[] = [];
	const changedRecords: BlockLookupRecord[] = [];
	let scanned = 0;
	let skipped = 0;
	const changedSources = getChangedBlockLookupSources(indexPlan.tasks);
	reportBlockLookupIndexProgress(options.onProgress, 'scanning-sources', sources.length, Math.max(1, sources.length), 10, 'sources');
	reportBlockLookupIndexProgress(options.onProgress, 'indexing-sources', 0, changedSources.length, 10, 'sources');
	if (renderedPreviewsEnabled) {
		reportBlockLookupIndexProgress(options.onProgress, 'extracting-rendered-previews', 0, changedSources.length, 45, 'sources');
	}

	const sourceIndexingOptions = createBlockLookupSourceIndexingOptions(changedSources, renderedPreviewsEnabled, options);
	const indexedSources =
		changedSources.length > 0
			? yield* sourceIndexingOptions
					? indexBlockLookupSourcesImpl(changedSources, {}, sourceIndexingOptions)
					: indexBlockLookupSourcesImpl(changedSources)
			: {
					recordsBySourcePath: new Map<string, BlockLookupRecord[]>()
				};
	reportBlockLookupIndexProgress(
		options.onProgress,
		'indexing-sources',
		changedSources.length,
		changedSources.length,
		renderedPreviewsEnabled ? 45 : 75,
		'sources'
	);
	if (renderedPreviewsEnabled) {
		reportBlockLookupIndexProgress(
			options.onProgress,
			'extracting-rendered-previews',
			changedSources.length,
			changedSources.length,
			75,
			'sources'
		);
	}

	const taskCount = indexPlan.tasks.length;
	for (const [taskIndex, task] of indexPlan.tasks.entries()) {
		if (task.reusedRecords) {
			skipped += 1;
			nextSources.push(task.existingSource);
			nextRecords.push(...task.reusedRecords);
		} else {
			const source = task.source;
			const records = indexedSources.recordsBySourcePath.get(source.sourcePath) ?? [];
			scanned += 1;
			nextSources.push(createBlockLookupSourceIndexRecord(source));
			changedRecords.push(...records);
			nextRecords.push(...records);
		}
		reportBlockLookupIndexProgress(
			options.onProgress,
			'finalizing',
			taskIndex + 1,
			Math.max(1, taskCount),
			75 + ((taskIndex + 1) / Math.max(1, taskCount)) * 20
		);
	}

	const previewCompletedRecords = renderedPreviewsEnabled
		? yield* assignModBundleRenderedPreviewsToRecords(nextRecords, nextSources, options, extractBlockLookupBundleOutcomesImpl)
		: nextRecords;
	const dedupedRecords = dedupeBlockLookupRecords(previewCompletedRecords);
	const dedupedChangedRecords = dedupeBlockLookupRecords(changedRecords);
	const index: PersistedBlockLookupIndex = {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: new Date().toISOString(),
		renderedPreviewsEnabled,
		sources: nextSources,
		records: dedupedRecords,
		sourceRecords: previewCompletedRecords
	};

	return {
		index,
		stats: createBlockLookupIndexStats(index, scanned, skipped, indexPlan.removed, dedupedChangedRecords.length)
	};
});

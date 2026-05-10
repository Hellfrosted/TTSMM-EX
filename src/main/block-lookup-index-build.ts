import {
	BLOCK_LOOKUP_INDEX_VERSION,
	type BlockLookupBuildRequest,
	type BlockLookupIndexSource,
	type BlockLookupIndexStats,
	type BlockLookupRecord,
	type BlockLookupSettings,
	type PersistedBlockLookupIndex
} from 'shared/block-lookup';
import { extractBundleTextAssets } from './block-lookup-bundle-text-assets';
import { extractRecordsFromSource } from './block-lookup-extraction';
import { createBlockLookupIndexPlan, createBlockLookupIndexStats, createBlockLookupSourceIndexRecord } from './block-lookup-index-planner';
import { collectBlockLookupSources } from './block-lookup-source-discovery';

interface BlockLookupIndexBuild {
	index: PersistedBlockLookupIndex;
	settings: BlockLookupSettings;
	stats: BlockLookupIndexStats;
}

export async function createBlockLookupIndexBuild(
	existingIndex: PersistedBlockLookupIndex,
	request: BlockLookupBuildRequest
): Promise<BlockLookupIndexBuild> {
	const { sources, workshopRoot } = collectBlockLookupSources(request);
	const indexPlan = createBlockLookupIndexPlan(existingIndex, sources, request.forceRebuild);
	const nextRecords: BlockLookupRecord[] = [];
	const nextSources: BlockLookupIndexSource[] = [];
	let scanned = 0;
	let skipped = 0;
	let updatedBlocks = 0;
	const changedBundleSources = indexPlan.tasks
		.filter((task) => task.source.sourceKind === 'bundle' && !task.reusedRecords)
		.map((task) => task.source);
	const bundleTextAssets =
		changedBundleSources.length > 0 ? await extractBundleTextAssets(changedBundleSources.map((source) => source.sourcePath)) : undefined;

	for (const task of indexPlan.tasks) {
		if (task.reusedRecords) {
			skipped += 1;
			nextSources.push(task.existingSource!);
			nextRecords.push(...task.reusedRecords);
			continue;
		}

		const source = task.source;
		const records = await extractRecordsFromSource(source, bundleTextAssets?.get(source.sourcePath));
		scanned += 1;
		updatedBlocks += records.length;
		nextSources.push(createBlockLookupSourceIndexRecord(source));
		nextRecords.push(...records);
	}

	const index: PersistedBlockLookupIndex = {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: new Date().toISOString(),
		sources: nextSources,
		records: nextRecords
	};

	return {
		index,
		settings: { workshopRoot },
		stats: createBlockLookupIndexStats(index, scanned, skipped, indexPlan.removed, updatedBlocks)
	};
}

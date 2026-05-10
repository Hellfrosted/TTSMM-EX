import {
	BLOCK_LOOKUP_INDEX_VERSION,
	type BlockLookupBuildRequest,
	type BlockLookupIndexSource,
	type BlockLookupIndexStats,
	type BlockLookupRecord,
	type BlockLookupSettings,
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
	settings: BlockLookupSettings;
	stats: BlockLookupIndexStats;
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
	let scanned = 0;
	let skipped = 0;
	let updatedBlocks = 0;
	const changedSources = indexPlan.tasks.filter((task) => !task.reusedRecords).map((task) => task.source);
	const indexedSources =
		changedSources.length > 0
			? await indexBlockLookupSourcesImpl(changedSources)
			: {
					records: [],
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

import type { BlockLookupRecord } from 'shared/block-lookup';
import {
	extractRecordsFromSources,
	type BlockLookupSourceExtractionAdapters,
	type BlockLookupSourceExtractionOptions
} from './block-lookup-extraction';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';

interface BlockLookupSourceIndexingAdapters {
	extractRecordsFromSources?: typeof extractRecordsFromSources;
	sourceExtractionAdapters?: BlockLookupSourceExtractionAdapters;
}

interface BlockLookupSourceIndexingOptions extends BlockLookupSourceExtractionOptions {
	onIndexedSourceBatch?: (completed: number, total: number) => void;
}

interface BlockLookupSourceIndexResult {
	recordsBySourcePath: Map<string, BlockLookupRecord[]>;
}

const BLOCK_LOOKUP_SOURCE_INDEX_BATCH_SIZE = 1;
const BLOCK_LOOKUP_MAX_PROGRESS_CONCURRENCY = 5;
const BLOCK_LOOKUP_LARGE_BUNDLE_BYTES = 16 * 1024 * 1024;
const BLOCK_LOOKUP_HUGE_BUNDLE_BYTES = 64 * 1024 * 1024;

function getProgressIndexingConcurrency(sources: readonly BlockLookupSourceRecord[]) {
	if (!sources.length) {
		return BLOCK_LOOKUP_SOURCE_INDEX_BATCH_SIZE;
	}

	const largestBundleSize = Math.max(...sources.map((source) => source.size));
	if (largestBundleSize >= BLOCK_LOOKUP_HUGE_BUNDLE_BYTES) {
		return BLOCK_LOOKUP_SOURCE_INDEX_BATCH_SIZE;
	}
	if (largestBundleSize >= BLOCK_LOOKUP_LARGE_BUNDLE_BYTES) {
		return 2;
	}

	return Math.min(BLOCK_LOOKUP_MAX_PROGRESS_CONCURRENCY, sources.length);
}

function getProgressIndexingSourceGroups(sources: readonly BlockLookupSourceRecord[]) {
	const hugeSources: Array<{ source: BlockLookupSourceRecord; sourceIndex: number }> = [];
	const largeSources: Array<{ source: BlockLookupSourceRecord; sourceIndex: number }> = [];
	const smallSources: Array<{ source: BlockLookupSourceRecord; sourceIndex: number }> = [];
	sources.forEach((source, sourceIndex) => {
		const indexedSource = { source, sourceIndex };
		if (source.sourceKind === 'bundle' && source.size >= BLOCK_LOOKUP_HUGE_BUNDLE_BYTES) {
			hugeSources.push(indexedSource);
			return;
		}
		if (source.sourceKind === 'bundle' && source.size >= BLOCK_LOOKUP_LARGE_BUNDLE_BYTES) {
			largeSources.push(indexedSource);
			return;
		}
		smallSources.push(indexedSource);
	});
	return [smallSources, largeSources, hugeSources].filter((group) => group.length > 0);
}

async function indexBlockLookupSourcesWithProgress(
	sources: readonly BlockLookupSourceRecord[],
	extractRecordsFromSourcesImpl: typeof extractRecordsFromSources,
	adapters: BlockLookupSourceIndexingAdapters,
	options: BlockLookupSourceIndexingOptions
): Promise<BlockLookupSourceIndexResult> {
	const recordsBySourcePathByIndex = new Map<number, BlockLookupRecord[]>();
	let completed = 0;
	for (const group of getProgressIndexingSourceGroups(sources)) {
		let nextGroupIndex = 0;
		const concurrency = getProgressIndexingConcurrency(group.map(({ source }) => source));
		const workerCount = Math.min(concurrency, group.length);
		const workers = Array.from({ length: workerCount }, async () => {
			while (nextGroupIndex < group.length) {
				const { source, sourceIndex } = group[nextGroupIndex];
				nextGroupIndex += 1;
				const batchRecordsBySourcePath = await extractRecordsFromSourcesImpl([source], adapters.sourceExtractionAdapters, options);
				recordsBySourcePathByIndex.set(sourceIndex, batchRecordsBySourcePath.get(source.sourcePath) ?? []);
				completed += 1;
				options.onIndexedSourceBatch?.(completed, sources.length);
			}
		});

		await Promise.all(workers);
	}

	const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
	for (const [sourceIndex, source] of sources.entries()) {
		recordsBySourcePath.set(source.sourcePath, recordsBySourcePathByIndex.get(sourceIndex) ?? []);
	}
	return {
		recordsBySourcePath
	};
}

export async function indexBlockLookupSources(
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceIndexingAdapters = {},
	options?: BlockLookupSourceIndexingOptions
): Promise<BlockLookupSourceIndexResult> {
	const extractRecordsFromSourcesImpl = adapters.extractRecordsFromSources ?? extractRecordsFromSources;
	const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
	let completed = 0;
	if (options?.onIndexedSourceBatch) {
		return indexBlockLookupSourcesWithProgress(sources, extractRecordsFromSourcesImpl, adapters, options);
	}
	const batchSize = options?.onIndexedSourceBatch ? BLOCK_LOOKUP_SOURCE_INDEX_BATCH_SIZE : Math.max(1, sources.length);
	for (let index = 0; index < sources.length; index += batchSize) {
		const batch = sources.slice(index, index + batchSize);
		const batchRecordsBySourcePath = await extractRecordsFromSourcesImpl(batch, adapters.sourceExtractionAdapters, options);
		for (const source of batch) {
			recordsBySourcePath.set(source.sourcePath, batchRecordsBySourcePath.get(source.sourcePath) ?? []);
		}
		completed += batch.length;
		options?.onIndexedSourceBatch?.(completed, sources.length);
	}
	return {
		recordsBySourcePath
	};
}

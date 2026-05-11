import { Effect } from 'effect';
import type { BlockLookupRecord } from 'shared/block-lookup';
import {
	type BlockLookupSourceExtractionAdapters,
	type BlockLookupSourceExtractionOptions,
	extractRecordsFromSources
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

const indexBlockLookupSourcesWithProgress = Effect.fnUntraced(function* (
	sources: readonly BlockLookupSourceRecord[],
	extractRecordsFromSourcesImpl: typeof extractRecordsFromSources,
	adapters: BlockLookupSourceIndexingAdapters,
	options: BlockLookupSourceIndexingOptions
): Effect.fn.Return<BlockLookupSourceIndexResult, unknown> {
	const recordsBySourcePathByIndex = new Map<number, BlockLookupRecord[]>();
	let completed = 0;
	for (const group of getProgressIndexingSourceGroups(sources)) {
		const concurrency = getProgressIndexingConcurrency(group.map(({ source }) => source));
		const groupResults = yield* Effect.forEach(
			group,
			({ source, sourceIndex }) =>
				extractRecordsFromSourcesImpl([source], adapters.sourceExtractionAdapters, options).pipe(
					Effect.map((batchRecordsBySourcePath) => {
						completed += 1;
						options.onIndexedSourceBatch?.(completed, sources.length);
						return { batchRecordsBySourcePath, source, sourceIndex };
					})
				),
			{ concurrency }
		);

		for (const { batchRecordsBySourcePath, source, sourceIndex } of groupResults) {
			recordsBySourcePathByIndex.set(sourceIndex, batchRecordsBySourcePath.get(source.sourcePath) ?? []);
		}
	}

	const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
	for (const [sourceIndex, source] of sources.entries()) {
		recordsBySourcePath.set(source.sourcePath, recordsBySourcePathByIndex.get(sourceIndex) ?? []);
	}
	return {
		recordsBySourcePath
	};
});

export const indexBlockLookupSources = Effect.fnUntraced(function* (
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceIndexingAdapters = {},
	options?: BlockLookupSourceIndexingOptions
): Effect.fn.Return<BlockLookupSourceIndexResult, unknown> {
	const extractRecordsFromSourcesImpl = adapters.extractRecordsFromSources ?? extractRecordsFromSources;
	const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
	let completed = 0;
	if (options?.onIndexedSourceBatch) {
		return yield* indexBlockLookupSourcesWithProgress(sources, extractRecordsFromSourcesImpl, adapters, options);
	}
	const batchSize = options?.onIndexedSourceBatch ? BLOCK_LOOKUP_SOURCE_INDEX_BATCH_SIZE : Math.max(1, sources.length);
	for (let index = 0; index < sources.length; index += batchSize) {
		const batch = sources.slice(index, index + batchSize);
		const batchRecordsBySourcePath = yield* extractRecordsFromSourcesImpl(batch, adapters.sourceExtractionAdapters, options);
		for (const source of batch) {
			recordsBySourcePath.set(source.sourcePath, batchRecordsBySourcePath.get(source.sourcePath) ?? []);
		}
		completed += batch.length;
		options?.onIndexedSourceBatch?.(completed, sources.length);
	}
	return {
		recordsBySourcePath
	};
});

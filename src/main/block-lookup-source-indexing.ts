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

export async function indexBlockLookupSources(
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceIndexingAdapters = {},
	options?: BlockLookupSourceIndexingOptions
): Promise<BlockLookupSourceIndexResult> {
	const extractRecordsFromSourcesImpl = adapters.extractRecordsFromSources ?? extractRecordsFromSources;
	const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
	let completed = 0;
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

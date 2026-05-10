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

interface BlockLookupSourceIndexResult {
	recordsBySourcePath: Map<string, BlockLookupRecord[]>;
}

export async function indexBlockLookupSources(
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceIndexingAdapters = {},
	options?: BlockLookupSourceExtractionOptions
): Promise<BlockLookupSourceIndexResult> {
	const extractRecordsFromSourcesImpl = adapters.extractRecordsFromSources ?? extractRecordsFromSources;
	const recordsBySourcePath = await extractRecordsFromSourcesImpl(sources, adapters.sourceExtractionAdapters, options);
	return {
		recordsBySourcePath
	};
}

import type { BlockLookupRecord } from 'shared/block-lookup';
import { extractRecordsFromSources, type BlockLookupSourceExtractionAdapters } from './block-lookup-extraction';
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
	adapters: BlockLookupSourceIndexingAdapters = {}
): Promise<BlockLookupSourceIndexResult> {
	const extractRecordsFromSourcesImpl = adapters.extractRecordsFromSources ?? extractRecordsFromSources;
	const recordsBySourcePath = await extractRecordsFromSourcesImpl(sources, adapters.sourceExtractionAdapters);
	return {
		recordsBySourcePath
	};
}

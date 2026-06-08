import { Effect } from 'effect';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import {
	type BlockLookupBundleExtractionOutcome,
	extractBlockLookupBundleOutcomes,
	extractBundleTextAssets
} from './block-lookup-bundle-text-assets';
import { createBlockLookupRecordsFromTextAssets, readBlockLookupSourceTextAsset } from './block-lookup-nuterra-text';
import { assignRenderedBlockPreviewsToRecords } from './block-lookup-rendered-preview-assignment';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';
import { extractVanillaSourceRecords } from './block-lookup-vanilla-source-records';

interface BlockLookupSourceExtractionAdapter {
	extractRecords(
		sources: readonly BlockLookupSourceRecord[],
		options?: BlockLookupSourceExtractionOptions
	): Effect.Effect<Map<string, BlockLookupRecord[]>, unknown>;
}

export type BlockLookupSourceExtractionAdapters = Partial<
	Record<BlockLookupSourceRecord['sourceKind'], BlockLookupSourceExtractionAdapter>
>;

interface BlockLookupBundleSourceExtractionAdapterDependencies {
	extractBlockLookupBundleOutcomes?: typeof extractBlockLookupBundleOutcomes;
	extractBundleTextAssets?: typeof extractBundleTextAssets;
}

export interface BlockLookupSourceExtractionOptions {
	previewCacheDir?: string;
	renderedPreviewsEnabled?: boolean;
}

function createSingleSourceExtractionAdapter(
	extractSourceRecords: (
		source: BlockLookupSourceRecord,
		options?: BlockLookupSourceExtractionOptions
	) => Effect.Effect<BlockLookupRecord[], unknown> | BlockLookupRecord[]
): BlockLookupSourceExtractionAdapter {
	return {
		extractRecords: Effect.fnUntraced(function* (sources, options): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				const records = extractSourceRecords(source, options);
				recordsBySourcePath.set(source.sourcePath, Array.isArray(records) ? records : yield* records);
			}
			return recordsBySourcePath;
		})
	};
}

function extractJsonSourceRecords(source: BlockLookupSourceRecord): BlockLookupRecord[] {
	try {
		return createBlockLookupRecordsFromTextAssets(source, [readBlockLookupSourceTextAsset(source.sourcePath)]);
	} catch (error) {
		log.warn(`Failed to index block source ${source.sourcePath}`);
		log.warn(error);
		return [];
	}
}

export function createBlockLookupBundleSourceExtractionAdapter(
	dependencies: BlockLookupBundleSourceExtractionAdapterDependencies = {}
): BlockLookupSourceExtractionAdapter {
	const createTextAssetOnlyOutcomes = Effect.fnUntraced(function* (
		sourcePaths: readonly string[]
	): Effect.fn.Return<Map<string, BlockLookupBundleExtractionOutcome>, unknown> {
		const textAssetsBySourcePath = yield* dependencies.extractBundleTextAssets!(sourcePaths);
		return new Map(
			[...textAssetsBySourcePath].map(([sourcePath, textAssets]) => [
				sourcePath,
				{
					issues: [],
					previewAssets: [],
					sourcePath,
					status: 'success',
					textAssets
				}
			])
		);
	});
	return {
		extractRecords: Effect.fnUntraced(function* (sources, options): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
			const sourcePaths = sources.map((source) => source.sourcePath);
			const blockLookupOutcomesBySourcePath = dependencies.extractBlockLookupBundleOutcomes
				? yield* dependencies.extractBlockLookupBundleOutcomes(sourcePaths)
				: dependencies.extractBundleTextAssets
					? yield* createTextAssetOnlyOutcomes(sourcePaths)
					: yield* extractBlockLookupBundleOutcomes(sourcePaths, { previewCacheDir: options?.previewCacheDir });
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				const outcome = blockLookupOutcomesBySourcePath.get(source.sourcePath);
				const records = createBlockLookupRecordsFromTextAssets(source, outcome?.textAssets ?? []);
				recordsBySourcePath.set(source.sourcePath, assignRenderedBlockPreviewsToRecords(records, outcome?.previewAssets ?? [], options));
			}
			return recordsBySourcePath;
		})
	};
}

function createDefaultSourceExtractionAdapters(): Required<BlockLookupSourceExtractionAdapters> {
	return {
		bundle: createBlockLookupBundleSourceExtractionAdapter(),
		json: createSingleSourceExtractionAdapter(extractJsonSourceRecords),
		vanilla: createSingleSourceExtractionAdapter(extractVanillaSourceRecords)
	};
}

function createBlockLookupSourceExtractionRouter(adapters: BlockLookupSourceExtractionAdapters = {}) {
	const sourceAdapters = {
		...createDefaultSourceExtractionAdapters(),
		...adapters
	};

	return {
		extractRecords: Effect.fnUntraced(function* (
			sources: readonly BlockLookupSourceRecord[],
			options?: BlockLookupSourceExtractionOptions
		): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			const sourcesByKind = new Map<BlockLookupSourceRecord['sourceKind'], BlockLookupSourceRecord[]>();
			for (const source of sources) {
				const kindSources = sourcesByKind.get(source.sourceKind) ?? [];
				kindSources.push(source);
				sourcesByKind.set(source.sourceKind, kindSources);
			}

			for (const [sourceKind, kindSources] of sourcesByKind) {
				const adapter = sourceAdapters[sourceKind];
				const extractedRecords = yield* options ? adapter.extractRecords(kindSources, options) : adapter.extractRecords(kindSources);
				for (const source of kindSources) {
					recordsBySourcePath.set(source.sourcePath, extractedRecords.get(source.sourcePath) ?? []);
				}
			}

			return recordsBySourcePath;
		})
	};
}

export const extractRecordsFromSources = Effect.fnUntraced(function* (
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceExtractionAdapters = {},
	options?: BlockLookupSourceExtractionOptions
): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
	return yield* createBlockLookupSourceExtractionRouter(adapters).extractRecords(sources, options);
});

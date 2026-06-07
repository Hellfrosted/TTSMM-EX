import { Effect } from 'effect';
import type { BlockLookupIndexSource, BlockLookupRecord } from 'shared/block-lookup';
import type { BlockLookupBundleExtractionOutcome } from './block-lookup-bundle-text-assets';
import {
	assignRenderedBlockPreviewsToRecords,
	getBlockLookupRecordPreviewMatchNameCandidates
} from './block-lookup-rendered-preview-assignment';

interface BlockLookupRenderedPreviewPolicyOptions {
	readonly previewCacheDir?: string;
}

interface BlockLookupRenderedPreviewBundleExtractionOptions {
	readonly previewCacheDir?: string;
	readonly previewMatchNames?: readonly string[];
}

export type BlockLookupRenderedPreviewBundleExtractor = (
	sourcePaths: readonly string[],
	options?: BlockLookupRenderedPreviewBundleExtractionOptions
) => Effect.Effect<Map<string, BlockLookupBundleExtractionOutcome>, unknown>;

function createModPreviewGroupKey(value: Pick<BlockLookupRecord | BlockLookupIndexSource, 'modTitle' | 'workshopId'>): string {
	return `${value.workshopId}\0${value.modTitle}`;
}

export const assignModBundleRenderedPreviewsToRecords = Effect.fnUntraced(function* (
	records: readonly BlockLookupRecord[],
	sources: readonly BlockLookupIndexSource[],
	options: BlockLookupRenderedPreviewPolicyOptions,
	extractBlockLookupBundleOutcomesImpl: BlockLookupRenderedPreviewBundleExtractor
): Effect.fn.Return<BlockLookupRecord[], unknown> {
	if (!options.previewCacheDir || records.every((record) => record.renderedPreview)) {
		return [...records];
	}

	const bundleSourcesByMod = new Map<string, BlockLookupIndexSource[]>();
	for (const source of sources) {
		if (source.sourceKind !== 'bundle') {
			continue;
		}
		const key = createModPreviewGroupKey(source);
		const bundleSources = bundleSourcesByMod.get(key) ?? [];
		bundleSources.push(source);
		bundleSourcesByMod.set(key, bundleSources);
	}

	const recordsByMod = new Map<string, Array<{ index: number; record: BlockLookupRecord }>>();
	records.forEach((record, index) => {
		if (record.sourceKind === 'vanilla' || record.renderedPreview) {
			return;
		}
		const key = createModPreviewGroupKey(record);
		const modRecords = recordsByMod.get(key) ?? [];
		modRecords.push({ index, record });
		recordsByMod.set(key, modRecords);
	});

	const assignedRecords = [...records];
	for (const [key, modRecords] of recordsByMod) {
		const bundleSources = bundleSourcesByMod.get(key);
		if (!bundleSources?.length) {
			continue;
		}
		const previewMatchNames = getBlockLookupRecordPreviewMatchNameCandidates(modRecords.map((entry) => entry.record));
		const outcomes = yield* extractBlockLookupBundleOutcomesImpl(
			bundleSources.map((source) => source.sourcePath),
			{ previewCacheDir: options.previewCacheDir, previewMatchNames }
		);
		const previewAssets = [...outcomes.values()].flatMap((outcome) => outcome.previewAssets);
		const recordsWithPreviews = assignRenderedBlockPreviewsToRecords(
			modRecords.map((entry) => entry.record),
			previewAssets,
			{ renderedPreviewsEnabled: true }
		);
		recordsWithPreviews.forEach((record, index) => {
			assignedRecords[modRecords[index].index] = record;
		});
	}

	return assignedRecords;
});

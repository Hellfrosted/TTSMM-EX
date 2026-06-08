import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import { toEffectOperationError } from 'shared/effect-errors';
import { loadBlockpediaVanillaPreviewAssets } from './block-lookup-blockpedia-previews';
import { type BlockLookupBundlePreviewAsset, extractBlockLookupBundleOutcomes } from './block-lookup-bundle-text-assets';
import { getBlockLookupRecordPreviewMatchNameCandidates } from './block-lookup-rendered-preview-assignment';

export interface BlockLookupRenderedPreviewAcquisitionOptions {
	readonly previewCacheDir?: string;
	readonly renderedPreviewsEnabled?: boolean;
}

function canAcquireRenderedPreviews(options: BlockLookupRenderedPreviewAcquisitionOptions | undefined): options is {
	readonly previewCacheDir: string;
	readonly renderedPreviewsEnabled: true;
} {
	return options?.renderedPreviewsEnabled === true && typeof options.previewCacheDir === 'string';
}

const discoverLocalVanillaPreviewSourcePaths = Effect.fnUntraced(function* (assemblyPath: string): Effect.fn.Return<string[]> {
	const dataRoot = path.resolve(assemblyPath, '..', '..');
	if (!fs.existsSync(dataRoot)) {
		return [];
	}

	return yield* Effect.try({
		try: () =>
			[
				path.join(dataRoot, 'StreamingAssets', 'blocks_shared'),
				path.join(dataRoot, 'StreamingAssets', 'gamescene'),
				path.join(dataRoot, 'resources.assets'),
				...fs
					.readdirSync(dataRoot, { withFileTypes: true })
					.flatMap((entry) => (entry.isFile() && /^sharedassets\d+\.assets$/i.test(entry.name) ? [path.join(dataRoot, entry.name)] : []))
			].filter((sourcePath, index, allSourcePaths) => fs.existsSync(sourcePath) && allSourcePaths.indexOf(sourcePath) === index),
		catch: (error) => toEffectOperationError(`discover vanilla block preview sources from ${dataRoot}`, error)
	}).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to discover vanilla block preview sources from ${dataRoot}`);
			log.warn(error);
			return Effect.succeed<string[]>([]);
		})
	);
});

export const loadLocalVanillaRenderedPreviewAssets = Effect.fnUntraced(function* (
	assemblyPath: string,
	records: readonly BlockLookupRecord[],
	options: BlockLookupRenderedPreviewAcquisitionOptions | undefined
): Effect.fn.Return<BlockLookupBundlePreviewAsset[]> {
	if (!canAcquireRenderedPreviews(options)) {
		return [];
	}

	const dataRoot = path.resolve(assemblyPath, '..', '..');
	const sourcePaths = yield* discoverLocalVanillaPreviewSourcePaths(assemblyPath);
	if (!sourcePaths.length) {
		return [];
	}

	const previewMatchNames = getBlockLookupRecordPreviewMatchNameCandidates(records);
	const outcomes = yield* extractBlockLookupBundleOutcomes(sourcePaths, {
		previewCacheDir: options.previewCacheDir,
		previewMatchNames
	}).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to extract vanilla block previews from ${dataRoot}`);
			log.warn(error);
			return Effect.succeed(null);
		})
	);
	return outcomes ? [...outcomes.values()].flatMap((outcome) => outcome.previewAssets) : [];
});

export const loadVanillaRenderedPreviewAssets = Effect.fnUntraced(function* (
	assemblyPath: string,
	records: readonly BlockLookupRecord[],
	options: BlockLookupRenderedPreviewAcquisitionOptions | undefined
): Effect.fn.Return<BlockLookupBundlePreviewAsset[]> {
	if (!canAcquireRenderedPreviews(options)) {
		return [];
	}

	const blockpediaPreviewAssets = yield* loadBlockpediaVanillaPreviewAssets(options.previewCacheDir);
	const localPreviewAssets = yield* loadLocalVanillaRenderedPreviewAssets(assemblyPath, records, options);
	return [...blockpediaPreviewAssets, ...localPreviewAssets];
});

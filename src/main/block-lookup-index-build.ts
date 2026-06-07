import { Effect } from 'effect';
import {
	type BlockLookupBuildRequest,
	type BlockLookupIndexProgressCallback,
	type BlockLookupIndexStats,
	type PersistedBlockLookupIndex
} from 'shared/block-lookup';
import { createBlockLookupIndexBuildPolicy } from './block-lookup-index-build-policy';
import { reportBlockLookupIndexProgress } from './block-lookup-index-progress';
import type { BlockLookupRenderedPreviewBundleExtractor } from './block-lookup-index-rendered-preview-policy';
import { collectBlockLookupSourcesEffect } from './block-lookup-source-discovery';
import { indexBlockLookupSources } from './block-lookup-source-indexing';

export { createBlockLookupIndexProgress } from './block-lookup-index-progress';

interface BlockLookupIndexBuildAdapters {
	readonly extractBlockLookupBundleOutcomes?: BlockLookupRenderedPreviewBundleExtractor;
	readonly indexBlockLookupSources?: typeof indexBlockLookupSources;
}

interface BlockLookupIndexBuildOptions {
	readonly previewCacheDir?: string;
}

interface BlockLookupIndexBuild {
	readonly index: PersistedBlockLookupIndex;
	readonly stats: BlockLookupIndexStats;
	readonly workshopRoot: string;
}

export const createBlockLookupIndexBuild = Effect.fnUntraced(function* (
	existingIndex: PersistedBlockLookupIndex,
	request: BlockLookupBuildRequest,
	adapters: BlockLookupIndexBuildAdapters = {},
	onProgress?: BlockLookupIndexProgressCallback,
	options: BlockLookupIndexBuildOptions = {}
): Effect.fn.Return<BlockLookupIndexBuild, unknown> {
	reportBlockLookupIndexProgress(onProgress, 'planning', 0, 1, 0);
	const { sources, workshopRoot } = yield* collectBlockLookupSourcesEffect(request);
	const renderedPreviewsEnabled = request.renderedPreviewsEnabled === true;
	const policyBuild = yield* createBlockLookupIndexBuildPolicy(existingIndex, sources, renderedPreviewsEnabled, {
		...(adapters.extractBlockLookupBundleOutcomes ? { extractBlockLookupBundleOutcomes: adapters.extractBlockLookupBundleOutcomes } : {}),
		...(request.forceRebuild !== undefined ? { forceRebuild: request.forceRebuild } : {}),
		...(adapters.indexBlockLookupSources ? { indexBlockLookupSources: adapters.indexBlockLookupSources } : {}),
		...(onProgress ? { onProgress } : {}),
		...(options.previewCacheDir ? { previewCacheDir: options.previewCacheDir } : {})
	});

	return {
		...policyBuild,
		workshopRoot
	};
});

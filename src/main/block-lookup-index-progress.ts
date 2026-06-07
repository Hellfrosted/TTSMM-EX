import type {
	BlockLookupIndexProgress,
	BlockLookupIndexProgressCallback,
	BlockLookupIndexProgressPhase,
	BlockLookupIndexSource
} from 'shared/block-lookup';

const BLOCK_LOOKUP_INDEX_PROGRESS_LABELS: Record<BlockLookupIndexProgressPhase, string> = {
	planning: 'Planning index build',
	'scanning-sources': 'Scanning source changes',
	'indexing-sources': 'Extracting block records',
	'extracting-rendered-previews': 'Extracting rendered block previews',
	finalizing: 'Finalizing indexed records',
	'writing-index': 'Writing index cache',
	complete: 'Index build complete'
};

export function createBlockLookupIndexProgress(
	phase: BlockLookupIndexProgressPhase,
	completed: number,
	total: number,
	percent: number,
	countUnit?: string
): BlockLookupIndexProgress {
	return {
		phase,
		phaseLabel: BLOCK_LOOKUP_INDEX_PROGRESS_LABELS[phase],
		countUnit,
		completed: Math.max(0, completed),
		total: Math.max(0, total),
		percent: Math.max(0, Math.min(100, Math.round(percent)))
	};
}

export function reportBlockLookupIndexProgress(
	onProgress: BlockLookupIndexProgressCallback | undefined,
	...args: Parameters<typeof createBlockLookupIndexProgress>
) {
	onProgress?.(createBlockLookupIndexProgress(...args));
}

function getBlockLookupSourceProgressWeight(source: BlockLookupIndexSource): number {
	return Number.isFinite(source.size) && source.size > 0 ? source.size : 1;
}

export function getBlockLookupSourceProgressPercent(
	sources: readonly BlockLookupIndexSource[],
	completed: number,
	total: number,
	startPercent: number,
	endPercent: number
): number {
	if (completed <= 0 || sources.length === 0) {
		return startPercent;
	}
	if (completed >= total && total > 0) {
		return endPercent;
	}
	if (sources.length !== total) {
		return startPercent + (completed / Math.max(1, total)) * (endPercent - startPercent);
	}

	const completedSources = sources.slice(0, Math.min(completed, sources.length));
	const completedWeight = completedSources.reduce((sum, source) => sum + getBlockLookupSourceProgressWeight(source), 0);
	const totalWeight = sources.reduce((sum, source) => sum + getBlockLookupSourceProgressWeight(source), 0);
	return startPercent + (completedWeight / Math.max(1, totalWeight)) * (endPercent - startPercent);
}

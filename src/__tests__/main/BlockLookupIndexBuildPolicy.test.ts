import { Effect } from 'effect';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { createBlockLookupIndexBuildPolicy } from '../../main/block-lookup-index-build-policy';
import type { BlockLookupSourceRecord } from '../../main/block-lookup-source-discovery';
import { BLOCK_LOOKUP_INDEX_VERSION, type BlockLookupRecord, type BlockLookupSourceKind } from '../../shared/block-lookup';
import { createTestBlockLookupRecord } from './test-utils';

function createSource(sourcePath: string, sourceKind: BlockLookupSourceKind, size: number, mtimeMs: number): BlockLookupSourceRecord {
	return {
		modTitle: 'Flaggship Industries',
		mtimeMs,
		size,
		sourceKind,
		sourcePath: path.normalize(sourcePath),
		workshopId: '3429943957'
	};
}

describe('block lookup index build policy', () => {
	it('reuses unchanged source records, scans changed sources, dedupes changed blocks, and reports stats', async () => {
		const unchangedSource = createSource('/mods/unchanged/StableBlock.json', 'json', 10, 20);
		const changedBundleSource = createSource('/mods/changed/Flaggship_bundle', 'bundle', 30, 40);
		const changedJsonSource = createSource('/mods/changed/BlockJSON/GSO-FSI Omni terminal.json', 'json', 50, 60);
		const removedSource = createSource('/mods/removed/RemovedBlock.json', 'json', 1, 2);
		const reusedRecord = createTestBlockLookupRecord({
			blockId: '100',
			blockName: 'Stable Block',
			internalName: 'StableBlock',
			sourcePath: unchangedSource.sourcePath
		});
		const removedRecord = createTestBlockLookupRecord({
			blockId: '0',
			blockName: 'Removed Block',
			internalName: 'RemovedBlock',
			sourcePath: removedSource.sourcePath
		});
		const indexChangedSources = vi.fn((sources: readonly BlockLookupSourceRecord[]) => {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				recordsBySourcePath.set(source.sourcePath, [
					createTestBlockLookupRecord({
						blockId: source.sourceKind === 'json' ? '121' : '',
						blockName: 'GSO-FSI Omni terminal',
						internalName: 'GSO-FSI Omni terminal',
						modTitle: source.modTitle,
						previewBounds: source.sourceKind === 'bundle' ? { x: 3, y: 6, z: 3 } : undefined,
						sourceKind: source.sourceKind,
						sourcePath: source.sourcePath,
						workshopId: source.workshopId
					})
				]);
			}
			return Effect.succeed({ recordsBySourcePath });
		});

		const build = await Effect.runPromise(
			createBlockLookupIndexBuildPolicy(
				{
					version: BLOCK_LOOKUP_INDEX_VERSION,
					builtAt: '2026-04-26T00:00:00.000Z',
					renderedPreviewsEnabled: false,
					sources: [unchangedSource, { ...changedJsonSource, size: 49 }, removedSource],
					records: [reusedRecord, removedRecord],
					sourceRecords: [reusedRecord, removedRecord]
				},
				[unchangedSource, changedBundleSource, changedJsonSource],
				false,
				{ indexBlockLookupSources: indexChangedSources }
			)
		);

		expect(indexChangedSources).toHaveBeenCalledWith([changedBundleSource, changedJsonSource]);
		expect(build.index.records).toEqual([
			reusedRecord,
			expect.objectContaining({
				blockId: '121',
				blockName: 'GSO-FSI Omni terminal',
				previewBounds: { x: 3, y: 6, z: 3 },
				sourceKind: 'json',
				sourcePath: changedJsonSource.sourcePath
			})
		]);
		expect(build.index.sourceRecords).toHaveLength(3);
		expect(build.stats).toMatchObject({
			sources: 3,
			scanned: 2,
			skipped: 1,
			removed: 1,
			blocks: 2,
			updatedBlocks: 1
		});
	});
});

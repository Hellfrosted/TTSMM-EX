import path from 'path';
import { describe, expect, it } from 'vitest';
import { createBlockLookupIndexPlan } from '../../main/block-lookup-index-planner';
import { BLOCK_LOOKUP_INDEX_VERSION } from '../../shared/block-lookup';

describe('block lookup index planner', () => {
	it('rescans when source metadata changes without a file change', () => {
		const source = { sourcePath: '/mod/file.json', sourceKind: 'json' as const, workshopId: '1', modTitle: 'Old', size: 10, mtimeMs: 20 };
		const index = { version: BLOCK_LOOKUP_INDEX_VERSION, builtAt: 'today', renderedPreviewsEnabled: false, sources: [source], records: [] };
		for (const changed of [{ modTitle: 'New' }, { workshopId: '2' }, { sourceKind: 'bundle' as const }]) {
			const plan = createBlockLookupIndexPlan(index, [{ ...source, ...changed }]);
			expect(plan.tasks[0]?.reusedRecords).toBeUndefined();
		}
	});
	it('marks unchanged sources for reuse and counts removed sources', () => {
		const existingSource = {
			sourcePath: path.normalize('/mods/a/Block.json'),
			sourceKind: 'json' as const,
			workshopId: 'a',
			modTitle: 'A',
			size: 10,
			mtimeMs: 20
		};
		const plan = createBlockLookupIndexPlan(
			{
				version: BLOCK_LOOKUP_INDEX_VERSION,
				builtAt: '2026-04-26T00:00:00.000Z',
				renderedPreviewsEnabled: false,
				sources: [
					existingSource,
					{
						sourcePath: path.normalize('/mods/removed/Block.json'),
						sourceKind: 'json' as const,
						workshopId: 'removed',
						modTitle: 'Removed',
						size: 1,
						mtimeMs: 1
					}
				],
				records: [
					{
						blockId: '1',
						blockName: 'Cab',
						fallbackAlias: 'Cab(A)',
						fallbackSpawnCommand: 'SpawnBlock Cab(A)',
						internalName: 'Cab',
						modTitle: 'A',
						preferredAlias: 'Cab(A)',
						sourceKind: 'json',
						sourcePath: existingSource.sourcePath,
						spawnCommand: 'SpawnBlock Cab(A)',
						workshopId: 'a'
					}
				]
			},
			[existingSource]
		);

		expect(plan.removed).toBe(1);
		expect(plan.tasks).toEqual([
			expect.objectContaining({
				existingSource,
				reusedRecords: [expect.objectContaining({ blockName: 'Cab' })],
				source: existingSource
			})
		]);
	});
});

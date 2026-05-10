import { describe, expect, it } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import {
	collectBlockLookupModSources,
	createBlockLookupBuildRequest,
	createBlockLookupSearchState,
	formatBlockLookupIndexStatus,
	getBlockLookupRecordKey,
	retainSelectedBlockLookupRow
} from '../../renderer/block-lookup-workspace';

describe('block-lookup-workspace', () => {
	it('formats index status with search counts', () => {
		expect(formatBlockLookupIndexStatus(null, 0, '')).toBe('Index not built');
		expect(formatBlockLookupIndexStatus({ blocks: 2, sources: 1, updatedAt: 123 }, 1, 'cab')).toBe(
			'2 indexed blocks from 1 source | 1 match'
		);
	});

	it('collects block lookup sources from loaded mods with paths', () => {
		const mods = new SessionMods('', [
			{ uid: 'local:a', id: 'a', name: 'Local A', type: ModType.LOCAL, path: '/mods/a' },
			{ uid: 'workshop:b', id: 'b', name: 'Workshop B', type: ModType.WORKSHOP, path: '/mods/b', workshopID: 123n },
			{ uid: 'local:no-path', id: 'c', name: 'No Path', type: ModType.LOCAL }
		]);
		setupDescriptors(mods, new Map());

		expect(collectBlockLookupModSources({ mods })).toEqual([
			{ uid: 'local:a', id: 'a', name: 'Local A', path: '/mods/a', workshopID: undefined },
			{ uid: 'workshop:b', id: 'b', name: 'Workshop B', path: '/mods/b', workshopID: '123' }
		]);
	});

	it('creates build requests from workspace inputs', () => {
		expect(createBlockLookupBuildRequest({ gameExec: '/game.exe' }, '/workshop', [], true)).toEqual({
			workshopRoot: '/workshop',
			gameExec: '/game.exe',
			modSources: [],
			forceRebuild: true
		});
	});

	it('retains selected rows only when still present', () => {
		const rows = [{ id: 'a' }, { id: 'b' }];
		const getKey = (row: { id: string }) => row.id;

		expect(retainSelectedBlockLookupRow(rows, 'b', getKey)).toBe('b');
		expect(retainSelectedBlockLookupRow(rows, 'missing', getKey)).toBe('a');
		expect(retainSelectedBlockLookupRow([], 'missing', getKey)).toBeUndefined();
	});

	it('creates search state with a stable selected record key', () => {
		const rows = [
			{
				blockId: '1',
				blockName: 'Cab',
				fallbackAlias: 'cab',
				fallbackSpawnCommand: 'cab',
				internalName: 'ControlCab',
				modTitle: 'Core',
				preferredAlias: 'cab',
				sourceKind: 'vanilla' as const,
				sourcePath: '/vanilla',
				spawnCommand: 'spawn cab',
				workshopId: ''
			},
			{
				blockId: '2',
				blockName: 'Wheel',
				fallbackAlias: 'wheel',
				fallbackSpawnCommand: 'wheel',
				internalName: 'Wheel',
				modTitle: 'Core',
				preferredAlias: 'wheel',
				sourceKind: 'vanilla' as const,
				sourcePath: '/vanilla',
				spawnCommand: 'spawn wheel',
				workshopId: ''
			}
		];
		const retainedKey = getBlockLookupRecordKey(rows[1]);

		expect(createBlockLookupSearchState({ rows, stats: null }, retainedKey)).toEqual({
			rows,
			stats: null,
			selectedRowKey: retainedKey
		});
		expect(createBlockLookupSearchState({ rows, stats: null }, 'missing').selectedRowKey).toBe(getBlockLookupRecordKey(rows[0]));
	});
});

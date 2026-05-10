import { describe, expect, it } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import type { BlockLookupRecord } from '../../shared/block-lookup';
import {
	collectBlockLookupModSources,
	createBlockLookupBootstrapState,
	createBlockLookupBuildRequest,
	createBlockLookupBuildIndexState,
	createBlockLookupSearchState,
	createBlockLookupSettingsSaveState,
	createBlockLookupWorkspaceSessionState,
	formatBlockLookupIndexStatus,
	getBlockLookupRecordKey,
	reduceBlockLookupWorkspaceSession,
	retainSelectedBlockLookupRow,
	sortBlockLookupRecords
} from '../../renderer/block-lookup-workspace';

function blockRecord(index: number, overrides: Partial<BlockLookupRecord> = {}): BlockLookupRecord {
	return {
		blockId: index.toString(),
		blockName: `Block ${index}`,
		fallbackAlias: `block-${index}`,
		fallbackSpawnCommand: `spawn block-${index}`,
		internalName: `Block${index}`,
		modTitle: 'Core',
		preferredAlias: `block-${index}`,
		sourceKind: 'vanilla' as const,
		sourcePath: '/vanilla',
		spawnCommand: `spawn block-${index}`,
		workshopId: '',
		...overrides
	};
}

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
			blockRecord(1, { blockName: 'Cab', internalName: 'ControlCab', spawnCommand: 'spawn cab' }),
			blockRecord(2, { blockName: 'Wheel', internalName: 'Wheel', spawnCommand: 'spawn wheel' })
		];
		const retainedKey = getBlockLookupRecordKey(rows[1]);

		expect(createBlockLookupSearchState({ rows, stats: null }, retainedKey)).toEqual({
			rows,
			stats: null,
			selectedRowKey: retainedKey
		});
		expect(createBlockLookupSearchState({ rows, stats: null }, 'missing').selectedRowKey).toBe(getBlockLookupRecordKey(rows[0]));
	});

	it('creates block lookup settings transitions from bootstrap, save, and build results', () => {
		const stats = { sources: 1, scanned: 2, skipped: 0, removed: 0, blocks: 3, updatedBlocks: 1, builtAt: 'now' };
		const settings = { workshopRoot: '/workshop' };

		expect(createBlockLookupBootstrapState(settings, stats)).toEqual({
			settings,
			stats,
			workshopRoot: '/workshop'
		});
		expect(createBlockLookupSettingsSaveState({ workshopRoot: '/saved' }, stats)).toEqual({
			settings: { workshopRoot: '/saved' },
			stats,
			workshopRoot: '/saved'
		});
		expect(createBlockLookupBuildIndexState({ settings: { workshopRoot: '/built' }, stats })).toEqual({
			settings: { workshopRoot: '/built' },
			stats,
			workshopRoot: '/built'
		});
	});

	it('reduces block lookup workspace session events', () => {
		const stats = { sources: 1, scanned: 2, skipped: 0, removed: 0, blocks: 3, updatedBlocks: 1, builtAt: 'now' };
		const rows = [blockRecord(1)];
		const initialState = createBlockLookupWorkspaceSessionState();

		const bootstrappedState = reduceBlockLookupWorkspaceSession(initialState, {
			type: 'bootstrap-loaded',
			settings: { workshopRoot: '/workshop' },
			stats
		});
		const searchingState = reduceBlockLookupWorkspaceSession(bootstrappedState, { type: 'search-started' });
		const completedState = reduceBlockLookupWorkspaceSession(searchingState, {
			type: 'search-completed',
			result: { rows, stats: { ...stats, blocks: 1 } }
		});
		const savedState = reduceBlockLookupWorkspaceSession(completedState, {
			type: 'settings-saved',
			settings: { workshopRoot: '/saved' }
		});
		const buildState = reduceBlockLookupWorkspaceSession(savedState, {
			type: 'build-index-completed',
			result: { settings: { workshopRoot: '/built' }, stats: { ...stats, blocks: 4 } }
		});

		expect(searchingState.loadingResults).toBe(true);
		expect(completedState).toEqual(
			expect.objectContaining({
				loadingResults: false,
				rows,
				stats: { ...stats, blocks: 1 },
				workshopRoot: '/workshop'
			})
		);
		expect(savedState.workshopRoot).toBe('/saved');
		expect(savedState.stats).toEqual({ ...stats, blocks: 1 });
		expect(buildState).toEqual(
			expect.objectContaining({
				settings: { workshopRoot: '/built' },
				stats: { ...stats, blocks: 4 },
				workshopRoot: '/built'
			})
		);
	});

	it('sorts records by configured column values while preserving relevance order by reference', () => {
		const rows = [
			blockRecord(10, { blockName: 'Wheel 10' }),
			blockRecord(2, { blockName: 'Wheel 2' }),
			blockRecord(1, { blockName: 'Wheel 1' })
		];

		expect(sortBlockLookupRecords(rows, 'relevance', 'ascend')).toBe(rows);
		expect(sortBlockLookupRecords(rows, 'blockName', 'ascend').map((record) => record.blockName)).toEqual([
			'Wheel 1',
			'Wheel 2',
			'Wheel 10'
		]);
		expect(sortBlockLookupRecords(rows, 'blockName', 'descend').map((record) => record.blockName)).toEqual([
			'Wheel 10',
			'Wheel 2',
			'Wheel 1'
		]);
	});

	it('sorts numeric block IDs numerically and falls back to stable record keys for ties', () => {
		const rows = [
			blockRecord(10, { blockId: '10' }),
			blockRecord(2, { blockId: '2', sourcePath: '/z' }),
			blockRecord(3, { blockId: '2', sourcePath: '/a' })
		];

		const sortedRows = sortBlockLookupRecords(rows, 'blockId', 'ascend');

		expect(sortedRows.map((record) => record.sourcePath)).toEqual(['/a', '/z', '/vanilla']);
		expect(sortedRows.map((record) => record.blockId)).toEqual(['2', '2', '10']);
	});
});

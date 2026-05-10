import { describe, expect, it } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import type { BlockLookupRecord } from '../../shared/block-lookup';
import {
	collectBlockLookupModSources,
	createBlockLookupBootstrapCacheProjection,
	createBlockLookupBootstrapState,
	createBlockLookupBuildRequest,
	createBlockLookupBuildIndexState,
	createBlockLookupSearchRequest,
	createBlockLookupSettingsSaveState,
	createBlockLookupWorkspaceSessionState,
	filterBlockLookupRowsByMods,
	formatBlockLookupIndexStatus,
	getAvailableBlockLookupModFilters,
	getBlockLookupRecordKey,
	getBlockLookupRowRange,
	reduceBlockLookupWorkspaceSession,
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

	it('creates search requests with a cap only for non-empty queries', () => {
		expect(createBlockLookupSearchRequest('')).toEqual({ query: '', limit: undefined });
		expect(createBlockLookupSearchRequest('  ')).toEqual({ query: '  ', limit: undefined });
		expect(createBlockLookupSearchRequest('cab')).toEqual({ query: 'cab', limit: 1000 });
	});

	it('filters block lookup rows and creates contiguous row ranges', () => {
		const rows = [blockRecord(1, { modTitle: 'Core' }), blockRecord(2, { modTitle: 'Beta' }), blockRecord(3, { modTitle: 'Core' })];
		const rowKeys = rows.map((record) => getBlockLookupRecordKey(record));

		expect(getAvailableBlockLookupModFilters(rows)).toEqual(['Beta', 'Core']);
		expect(filterBlockLookupRowsByMods(rows, ['Core']).map((record) => record.blockId)).toEqual(['1', '3']);
		expect(filterBlockLookupRowsByMods(rows, [])).toBe(rows);
		expect(getBlockLookupRowRange(rowKeys, rowKeys[0], rowKeys[2])).toEqual(rowKeys);
		expect(getBlockLookupRowRange(rowKeys, 'missing', rowKeys[1])).toEqual([rowKeys[1]]);
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
		const searchingState = reduceBlockLookupWorkspaceSession(bootstrappedState, { type: 'search-started', requestId: 1 });
		const completedState = reduceBlockLookupWorkspaceSession(searchingState, {
			type: 'search-completed',
			requestId: 1,
			result: { rows, stats: { ...stats, blocks: 1 } }
		});
		const savedState = reduceBlockLookupWorkspaceSession(completedState, {
			type: 'settings-saved',
			settings: { workshopRoot: '/saved' }
		});
		const buildState = reduceBlockLookupWorkspaceSession(savedState, {
			type: 'build-index-completed',
			forceRebuild: false,
			result: { settings: { workshopRoot: '/built' }, stats: { ...stats, blocks: 4 } }
		});
		const failedBuildState = reduceBlockLookupWorkspaceSession(buildState, {
			type: 'build-index-failed',
			forceRebuild: true,
			message: 'Workshop root is unavailable'
		});

		expect(searchingState.loadingResults).toBe(true);
		expect(completedState).toEqual(
			expect.objectContaining({
				activeSearchRequestId: 1,
				availableModFilters: ['Core'],
				filteredRows: rows,
				loadingResults: false,
				rows,
				selectedRecord: rows[0],
				selectedRowKey: getBlockLookupRecordKey(rows[0]),
				selectedRowKeys: [getBlockLookupRecordKey(rows[0])],
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
				indexRunStatus: {
					actionLabel: 'Index update',
					detail: '4 blocks indexed from 1 source.',
					phase: 'success',
					title: 'Index update complete'
				},
				workshopRoot: '/built'
			})
		);
		expect(failedBuildState.indexRunStatus).toEqual({
			actionLabel: 'Full rebuild',
			detail: 'Workshop root is unavailable',
			phase: 'error',
			title: 'Full rebuild failed'
		});
		expect(reduceBlockLookupWorkspaceSession(failedBuildState, { type: 'build-index-status-cleared' }).indexRunStatus).toBeUndefined();
	});

	it('projects bootstrap cache data from workspace session state', () => {
		const stats = { sources: 1, scanned: 2, skipped: 0, removed: 0, blocks: 3, updatedBlocks: 1, builtAt: 'now' };
		const initialState = createBlockLookupWorkspaceSessionState();
		const bootstrappedState = reduceBlockLookupWorkspaceSession(initialState, {
			type: 'bootstrap-loaded',
			settings: { workshopRoot: '/workshop' },
			stats
		});
		const savedState = reduceBlockLookupWorkspaceSession(bootstrappedState, {
			type: 'settings-saved',
			settings: { workshopRoot: '/saved' }
		});
		const builtState = reduceBlockLookupWorkspaceSession(savedState, {
			type: 'build-index-completed',
			forceRebuild: false,
			result: { settings: { workshopRoot: '/built' }, stats: { ...stats, blocks: 4 } }
		});

		expect(createBlockLookupBootstrapCacheProjection(bootstrappedState)).toEqual([{ workshopRoot: '/workshop' }, stats]);
		expect(createBlockLookupBootstrapCacheProjection(savedState)).toEqual([{ workshopRoot: '/saved' }, stats]);
		expect(createBlockLookupBootstrapCacheProjection(builtState)).toEqual([{ workshopRoot: '/built' }, { ...stats, blocks: 4 }]);
	});

	it('retains the selected block lookup row across refreshed search results', () => {
		const stats = { sources: 1, scanned: 2, skipped: 0, removed: 0, blocks: 3, updatedBlocks: 1, builtAt: 'now' };
		const firstRows = [blockRecord(1), blockRecord(2)];
		const secondRows = [blockRecord(3), blockRecord(2)];
		const rowKeys = firstRows.map((record) => getBlockLookupRecordKey(record));
		const initialSearch = reduceBlockLookupWorkspaceSession(createBlockLookupWorkspaceSessionState(), {
			type: 'search-started',
			requestId: 1
		});
		const initialResults = reduceBlockLookupWorkspaceSession(initialSearch, {
			type: 'search-completed',
			requestId: 1,
			result: { rows: firstRows, stats }
		});
		const selectedState = reduceBlockLookupWorkspaceSession(initialResults, {
			type: 'selection-single-requested',
			rowKey: rowKeys[1]
		});
		const refreshingState = reduceBlockLookupWorkspaceSession(selectedState, { type: 'search-started', requestId: 2 });
		const refreshedState = reduceBlockLookupWorkspaceSession(refreshingState, {
			type: 'search-completed',
			requestId: 2,
			result: { rows: secondRows, stats }
		});

		expect(refreshedState.selectedRowKey).toBe(getBlockLookupRecordKey(firstRows[1]));
		expect(refreshedState.selectedRecord?.blockId).toBe('2');
		expect(refreshedState.selectedRowKeys).toEqual([getBlockLookupRecordKey(firstRows[1])]);
	});

	it('discards stale search results in the workspace session', () => {
		const stats = { sources: 1, scanned: 2, skipped: 0, removed: 0, blocks: 3, updatedBlocks: 1, builtAt: 'now' };
		const existingRows = [blockRecord(1)];
		const staleRows = [blockRecord(99)];
		const nextRows = [blockRecord(2)];
		const firstSearch = reduceBlockLookupWorkspaceSession(createBlockLookupWorkspaceSessionState(), {
			type: 'search-started',
			requestId: 1
		});
		const firstCompletion = reduceBlockLookupWorkspaceSession(firstSearch, {
			type: 'search-completed',
			requestId: 1,
			result: { rows: existingRows, stats }
		});
		const secondSearch = reduceBlockLookupWorkspaceSession(firstCompletion, { type: 'search-started', requestId: 2 });
		const staleCompletion = reduceBlockLookupWorkspaceSession(secondSearch, {
			type: 'search-completed',
			requestId: 1,
			result: { rows: staleRows, stats: { ...stats, blocks: 99 } }
		});
		const completed = reduceBlockLookupWorkspaceSession(staleCompletion, {
			type: 'search-completed',
			requestId: 2,
			result: { rows: nextRows, stats }
		});

		expect(staleCompletion).toBe(secondSearch);
		expect(staleCompletion.rows).toEqual(existingRows);
		expect(staleCompletion.loadingResults).toBe(true);
		expect(staleCompletion.stats).toEqual(stats);
		expect(staleCompletion.selectedRowKey).toBe(getBlockLookupRecordKey(existingRows[0]));
		expect(completed.rows).toEqual(nextRows);
		expect(completed.selectedRowKey).toBe(getBlockLookupRecordKey(nextRows[0]));
	});

	it('owns filtered multi-row selection and copy order in the workspace session', () => {
		const rows = [blockRecord(1, { modTitle: 'Core' }), blockRecord(2, { modTitle: 'Beta' }), blockRecord(3, { modTitle: 'Core' })];
		const rowKeys = rows.map((record) => getBlockLookupRecordKey(record));
		const initialState = reduceBlockLookupWorkspaceSession(
			reduceBlockLookupWorkspaceSession(createBlockLookupWorkspaceSessionState(), { type: 'search-started', requestId: 1 }),
			{ type: 'search-completed', requestId: 1, result: { rows, stats: null } }
		);
		const sortedCopyOrder = [rowKeys[2], rowKeys[1], rowKeys[0]];
		const selectedAnchorState = reduceBlockLookupWorkspaceSession(initialState, {
			type: 'selection-row-requested',
			rowKey: rowKeys[2],
			orderedRowKeys: rowKeys,
			range: false,
			toggle: false
		});
		const rangeState = reduceBlockLookupWorkspaceSession(selectedAnchorState, {
			type: 'selection-row-requested',
			rowKey: rowKeys[1],
			orderedRowKeys: rowKeys,
			range: true,
			toggle: false
		});
		const reorderedState = reduceBlockLookupWorkspaceSession(rangeState, {
			type: 'selection-copy-order-changed',
			orderedRowKeys: sortedCopyOrder
		});
		const filteredState = reduceBlockLookupWorkspaceSession(reorderedState, {
			type: 'selected-filter-mods-changed',
			selectedMods: ['Core']
		});

		expect(rangeState.selectedRowKeys).toEqual([rowKeys[1], rowKeys[2]]);
		expect(rangeState.selectedRowKeysInCopyOrder).toEqual([rowKeys[1], rowKeys[2]]);
		expect(reorderedState.selectedRowKeys).toEqual(rangeState.selectedRowKeys);
		expect(reorderedState.selectedRowKey).toBe(rangeState.selectedRowKey);
		expect(reorderedState.selectedRowKeysInCopyOrder).toEqual([rowKeys[2], rowKeys[1]]);
		expect(filteredState.filteredRows.map((record) => record.blockId)).toEqual(['1', '3']);
		expect(filteredState.selectedRowKeys).toEqual([rowKeys[2]]);
		expect(filteredState.selectedRowKeysInCopyOrder).toEqual([rowKeys[2]]);
		expect(filteredState.selectedRecord?.blockId).toBe('3');
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

	it('sorts internal block names and falls back to stable record keys for ties', () => {
		const rows = [
			blockRecord(10, { internalName: 'Wheel 10' }),
			blockRecord(2, { internalName: 'Wheel 2', sourcePath: '/z' }),
			blockRecord(3, { internalName: 'Wheel 2', sourcePath: '/a' })
		];

		const sortedRows = sortBlockLookupRecords(rows, 'internalName', 'ascend');

		expect(sortedRows.map((record) => record.sourcePath)).toEqual(['/a', '/z', '/vanilla']);
		expect(sortedRows.map((record) => record.internalName)).toEqual(['Wheel 2', 'Wheel 2', 'Wheel 10']);
	});
});

import { getRows, type AppState, type BlockLookupColumnKey } from 'model';
import type {
	BlockLookupBuildResult,
	BlockLookupBuildRequest,
	BlockLookupIndexProgress,
	BlockLookupIndexStats,
	BlockLookupModSource,
	BlockLookupSearchRow,
	BlockLookupSearchResult,
	BlockLookupSettings
} from 'shared/block-lookup';
import type { BlockLookupSortDirection, BlockLookupSortKey } from 'renderer/state/block-lookup-store';

type BlockLookupWorkspaceAppState = Pick<AppState, 'mods'>;

interface BlockLookupSettingsState {
	renderedPreviewsEnabled: boolean;
	settings: BlockLookupSettings;
	stats: BlockLookupIndexStats | null;
	workshopRoot: string;
}

type BlockLookupIndexRunPhase = 'running' | 'success' | 'error';

export interface BlockLookupIndexRunStatus {
	actionLabel: string;
	detail: string;
	phase: BlockLookupIndexRunPhase;
	progress?: BlockLookupIndexProgress;
	title: string;
}

interface BlockLookupWorkspaceSessionState extends BlockLookupSettingsState {
	activeSearchRequestId: number;
	availableModFilters: string[];
	buildingIndex: boolean;
	copyRowKeys: string[];
	filteredRows: BlockLookupSearchRow[];
	loadingResults: boolean;
	query: string;
	rows: BlockLookupSearchRow[];
	selectedFilterMods: string[];
	selectedRecord?: BlockLookupSearchRow;
	selectedRowKey?: string;
	selectedRowKeys: string[];
	selectedRowKeysInCopyOrder: string[];
	selectionAnchorRowKey?: string;
	indexRunStatus?: BlockLookupIndexRunStatus;
}

type BlockLookupWorkspaceSessionEvent =
	| { type: 'bootstrap-loaded'; settings: BlockLookupSettings; stats: BlockLookupIndexStats | null }
	| { type: 'build-index-completed'; forceRebuild: boolean; result: BlockLookupBuildResult }
	| { type: 'build-index-failed'; forceRebuild: boolean; message: string }
	| { type: 'build-index-finished' }
	| { type: 'build-index-progressed'; progress: BlockLookupIndexProgress }
	| { type: 'build-index-status-cleared' }
	| { type: 'build-index-started'; forceRebuild: boolean }
	| { type: 'query-changed'; query: string }
	| { type: 'search-completed'; requestId: number; result: BlockLookupSearchResult }
	| { type: 'search-finished'; requestId: number }
	| { type: 'search-started'; requestId: number }
	| { type: 'selected-filter-mods-changed'; selectedMods: string[] }
	| { type: 'settings-saved'; settings: BlockLookupSettings }
	| { type: 'selection-all-requested'; orderedRowKeys: string[] }
	| { type: 'selection-copy-order-changed'; orderedRowKeys: string[] }
	| { type: 'selection-row-requested'; rowKey: string; orderedRowKeys: string[]; range: boolean; toggle: boolean }
	| { type: 'selection-single-requested'; rowKey?: string }
	| { type: 'rendered-previews-enabled-changed'; renderedPreviewsEnabled: boolean }
	| { type: 'workshop-root-changed'; workshopRoot: string };

export function createBlockLookupWorkspaceSessionState(): BlockLookupWorkspaceSessionState {
	return {
		activeSearchRequestId: 0,
		availableModFilters: [],
		buildingIndex: false,
		copyRowKeys: [],
		filteredRows: [],
		loadingResults: false,
		query: '',
		renderedPreviewsEnabled: false,
		rows: [],
		selectedFilterMods: [],
		selectedRecord: undefined,
		selectedRowKey: undefined,
		selectedRowKeys: [],
		selectedRowKeysInCopyOrder: [],
		selectionAnchorRowKey: undefined,
		indexRunStatus: undefined,
		settings: { workshopRoot: '', renderedPreviewsEnabled: false },
		stats: null,
		workshopRoot: ''
	};
}

export function reduceBlockLookupWorkspaceSession(
	state: BlockLookupWorkspaceSessionState,
	event: BlockLookupWorkspaceSessionEvent
): BlockLookupWorkspaceSessionState {
	switch (event.type) {
		case 'bootstrap-loaded':
			return {
				...state,
				...createBlockLookupBootstrapState(event.settings, event.stats)
			};
		case 'build-index-completed':
			return {
				...state,
				...createBlockLookupBuildIndexState(event.result, state.settings),
				indexRunStatus: createBlockLookupIndexRunSuccessStatus(event.result, event.forceRebuild)
			};
		case 'build-index-failed':
			return {
				...state,
				indexRunStatus: createBlockLookupIndexRunFailureStatus(event.message, event.forceRebuild)
			};
		case 'build-index-finished':
			return {
				...state,
				buildingIndex: false
			};
		case 'build-index-progressed':
			if (!state.buildingIndex || state.indexRunStatus?.phase !== 'running') {
				return state;
			}
			return {
				...state,
				indexRunStatus: createBlockLookupIndexRunProgressStatus(state.indexRunStatus?.actionLabel === 'Full rebuild', event.progress)
			};
		case 'build-index-status-cleared':
			return {
				...state,
				indexRunStatus: undefined
			};
		case 'build-index-started':
			return {
				...state,
				buildingIndex: true,
				indexRunStatus: createBlockLookupIndexRunProgressStatus(event.forceRebuild)
			};
		case 'query-changed':
			return {
				...state,
				query: event.query
			};
		case 'search-completed':
			if (event.requestId !== state.activeSearchRequestId) {
				return state;
			}
			return createBlockLookupRowsState(
				{
					...state,
					loadingResults: false,
					rows: event.result.rows,
					stats: event.result.stats
				},
				state.selectedRowKey
			);
		case 'search-finished':
			if (event.requestId !== state.activeSearchRequestId) {
				return state;
			}
			return {
				...state,
				loadingResults: false
			};
		case 'search-started':
			return {
				...state,
				activeSearchRequestId: event.requestId,
				loadingResults: true
			};
		case 'selected-filter-mods-changed':
			return createBlockLookupRowsState(
				{
					...state,
					selectedFilterMods: event.selectedMods
				},
				state.selectedRowKey
			);
		case 'selection-all-requested':
			if (event.orderedRowKeys.length === 0) {
				return {
					...state,
					copyRowKeys: event.orderedRowKeys,
					...createBlockLookupSelectionState(state, [], undefined, undefined, event.orderedRowKeys)
				};
			}
			return {
				...state,
				copyRowKeys: event.orderedRowKeys,
				...createBlockLookupSelectionState(
					state,
					event.orderedRowKeys,
					event.orderedRowKeys[0],
					event.orderedRowKeys[0],
					event.orderedRowKeys
				)
			};
		case 'selection-copy-order-changed':
			return {
				...state,
				copyRowKeys: event.orderedRowKeys,
				...createBlockLookupSelectionState(
					state,
					state.selectedRowKeys,
					state.selectedRowKey,
					state.selectionAnchorRowKey,
					event.orderedRowKeys
				)
			};
		case 'selection-row-requested':
			return reduceBlockLookupRowSelection(state, event);
		case 'selection-single-requested':
			return {
				...state,
				...createBlockLookupSelectionState(state, event.rowKey ? [event.rowKey] : [], event.rowKey, event.rowKey, state.copyRowKeys)
			};
		case 'settings-saved':
			return {
				...state,
				...createBlockLookupSettingsSaveState(event.settings, state.stats)
			};
		case 'rendered-previews-enabled-changed':
			return {
				...state,
				renderedPreviewsEnabled: event.renderedPreviewsEnabled
			};
		case 'workshop-root-changed':
			return {
				...state,
				workshopRoot: event.workshopRoot
			};
		default:
			return state;
	}
}

export function createBlockLookupSearchRequest(query: string) {
	return {
		query
	};
}

export function getBlockLookupRecordKey(record: BlockLookupSearchRow) {
	return `${record.sourcePath}:${record.internalName}:${record.blockName}:${record.blockId}`;
}

export function formatBlockLookupIndexStatus(stats: BlockLookupIndexStats | null, resultCount: number, query: string) {
	if (!stats) {
		return 'Index not built';
	}

	const searchSuffix = query.trim() ? ` | ${resultCount} match${resultCount === 1 ? '' : 'es'}` : '';
	return `${stats.blocks} indexed block${stats.blocks === 1 ? '' : 's'} from ${stats.sources} source${stats.sources === 1 ? '' : 's'}${searchSuffix}`;
}

export function collectBlockLookupModSources(appState: BlockLookupWorkspaceAppState): BlockLookupModSource[] {
	return getRows(appState.mods).flatMap((mod) =>
		mod.path
			? [
					{
						uid: mod.uid,
						id: mod.id || undefined,
						name: mod.name,
						path: mod.path,
						workshopID: mod.workshopID?.toString()
					}
				]
			: []
	);
}

export function createBlockLookupBuildRequest(
	config: { gameExec: string },
	workshopRoot: string,
	modSources: BlockLookupModSource[],
	forceRebuild = false,
	renderedPreviewsEnabled = false
): BlockLookupBuildRequest {
	return {
		workshopRoot,
		gameExec: config.gameExec,
		modSources,
		forceRebuild,
		renderedPreviewsEnabled
	};
}

export function getAvailableBlockLookupModFilters(rows: BlockLookupSearchRow[]) {
	return Array.from(new Set(rows.flatMap((record) => (record.modTitle.trim() ? [record.modTitle] : [])))).sort((leftMod, rightMod) =>
		leftMod.localeCompare(rightMod)
	);
}

export function filterBlockLookupRowsByMods(rows: BlockLookupSearchRow[], selectedMods: string[]) {
	if (selectedMods.length === 0) {
		return rows;
	}

	const selectedModSet = new Set(selectedMods);
	return rows.filter((record) => selectedModSet.has(record.modTitle));
}

export function getBlockLookupRowRange(orderedRowKeys: string[], anchorRowKey: string | undefined, targetRowKey: string) {
	const targetIndex = orderedRowKeys.indexOf(targetRowKey);
	if (targetIndex < 0) {
		return [];
	}

	const anchorIndex = anchorRowKey ? orderedRowKeys.indexOf(anchorRowKey) : -1;
	if (anchorIndex < 0) {
		return [targetRowKey];
	}

	const startIndex = Math.min(anchorIndex, targetIndex);
	const endIndex = Math.max(anchorIndex, targetIndex);
	return orderedRowKeys.slice(startIndex, endIndex + 1);
}

function getBlockLookupBuildActionLabel(forceRebuild: boolean) {
	return forceRebuild ? 'Full rebuild' : 'Index update';
}

function createInitialBlockLookupIndexProgress(): BlockLookupIndexProgress {
	return {
		phase: 'planning',
		phaseLabel: 'Planning index build',
		completed: 0,
		total: 1,
		percent: 0
	};
}

function formatBlockLookupIndexProgressDetail(progress: BlockLookupIndexProgress): string {
	if (progress.countUnit && progress.total > 0) {
		return `${progress.phaseLabel} (${progress.completed}/${progress.total} ${progress.countUnit})`;
	}
	return progress.phaseLabel;
}

function createBlockLookupIndexRunProgressStatus(
	forceRebuild: boolean,
	progress = createInitialBlockLookupIndexProgress()
): BlockLookupIndexRunStatus {
	const actionLabel = getBlockLookupBuildActionLabel(forceRebuild);
	return {
		actionLabel,
		detail: formatBlockLookupIndexProgressDetail(progress),
		phase: 'running',
		progress,
		title: `${actionLabel} running`
	};
}

function createBlockLookupIndexRunSuccessStatus(result: BlockLookupBuildResult, forceRebuild: boolean): BlockLookupIndexRunStatus {
	const actionLabel = getBlockLookupBuildActionLabel(forceRebuild);
	const previewDetail = result.stats.renderedPreviewsEnabled
		? ` ${result.stats.renderedPreviews} preview${result.stats.renderedPreviews === 1 ? '' : 's'} rendered, ${
				result.stats.unavailablePreviews
			} unavailable.`
		: '';
	return {
		actionLabel,
		detail: `${result.stats.blocks} block${result.stats.blocks === 1 ? '' : 's'} indexed from ${result.stats.sources} source${
			result.stats.sources === 1 ? '' : 's'
		}.${previewDetail}`,
		phase: 'success',
		title: `${actionLabel} complete`
	};
}

function createBlockLookupIndexRunFailureStatus(message: string, forceRebuild: boolean): BlockLookupIndexRunStatus {
	const actionLabel = getBlockLookupBuildActionLabel(forceRebuild);
	return {
		actionLabel,
		detail: message,
		phase: 'error',
		title: `${actionLabel} failed`
	};
}

export function createBlockLookupBootstrapState(
	settings: BlockLookupSettings,
	stats: BlockLookupIndexStats | null
): BlockLookupSettingsState {
	return {
		renderedPreviewsEnabled: settings.renderedPreviewsEnabled,
		settings,
		stats,
		workshopRoot: settings.workshopRoot
	};
}

export function createBlockLookupSettingsSaveState(
	settings: BlockLookupSettings,
	currentStats: BlockLookupIndexStats | null
): BlockLookupSettingsState {
	return createBlockLookupBootstrapState(settings, currentStats);
}

export function createBlockLookupBuildIndexState(
	result: BlockLookupBuildResult,
	settings: BlockLookupSettings = { workshopRoot: '', renderedPreviewsEnabled: false }
): BlockLookupSettingsState {
	return {
		renderedPreviewsEnabled: settings.renderedPreviewsEnabled,
		settings,
		stats: result.stats,
		workshopRoot: settings.workshopRoot
	};
}

export function createBlockLookupBootstrapCacheProjection(
	state: Pick<BlockLookupWorkspaceSessionState, 'settings' | 'stats'>
): readonly [BlockLookupSettings, BlockLookupIndexStats | null] {
	return [state.settings, state.stats] as const;
}

function getBlockLookupSortValue(record: BlockLookupSearchRow, sortKey: BlockLookupColumnKey) {
	switch (sortKey) {
		case 'preview':
			return record.blockName;
		case 'spawnCommand':
			return record.spawnCommand;
		case 'blockName':
			return record.blockName;
		case 'internalName':
			return record.internalName;
		case 'modTitle':
			return record.modTitle;
		default:
			return '';
	}
}

function compareBlockLookupSortValues(leftValue: string, rightValue: string) {
	const leftNumber = Number(leftValue);
	const rightNumber = Number(rightValue);
	if (leftValue && rightValue && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
		return leftNumber - rightNumber;
	}

	return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortBlockLookupRecords(rows: BlockLookupSearchRow[], sortKey: BlockLookupSortKey, sortDirection: BlockLookupSortDirection) {
	if (sortKey === 'relevance') {
		return rows;
	}

	const directionMultiplier = sortDirection === 'ascend' ? 1 : -1;
	return Array.from(rows).sort((leftRecord, rightRecord) => {
		const compared = compareBlockLookupSortValues(
			getBlockLookupSortValue(leftRecord, sortKey),
			getBlockLookupSortValue(rightRecord, sortKey)
		);
		if (compared !== 0) {
			return compared * directionMultiplier;
		}

		return getBlockLookupRecordKey(leftRecord).localeCompare(getBlockLookupRecordKey(rightRecord));
	});
}

function createBlockLookupRowsState(
	state: BlockLookupWorkspaceSessionState,
	preferredSelectedRowKey: string | undefined
): BlockLookupWorkspaceSessionState {
	const filteredRows = filterBlockLookupRowsByMods(state.rows, state.selectedFilterMods);
	const visibleRowKeys = filteredRows.map((record) => getBlockLookupRecordKey(record));
	const visibleRowKeySet = new Set(visibleRowKeys);
	const selectedRowKeys = retainSelectedBlockLookupRowKeys(state.selectedRowKeys, visibleRowKeySet, visibleRowKeys);
	const selectedRowKey =
		preferredSelectedRowKey && visibleRowKeySet.has(preferredSelectedRowKey)
			? preferredSelectedRowKey
			: state.selectedRowKey && visibleRowKeySet.has(state.selectedRowKey)
				? state.selectedRowKey
				: selectedRowKeys[0];
	const selectionAnchorRowKey =
		state.selectionAnchorRowKey && visibleRowKeySet.has(state.selectionAnchorRowKey) ? state.selectionAnchorRowKey : selectedRowKey;
	const nextState = {
		...state,
		availableModFilters: getAvailableBlockLookupModFilters(state.rows),
		filteredRows
	};

	return {
		...nextState,
		...createBlockLookupSelectionState(nextState, selectedRowKeys, selectedRowKey, selectionAnchorRowKey, state.copyRowKeys)
	};
}

function retainSelectedBlockLookupRowKeys(currentKeys: string[], visibleRowKeySet: Set<string>, visibleRowKeys: string[]) {
	const retainedKeys = currentKeys.filter((key) => visibleRowKeySet.has(key));
	if (retainedKeys.length > 0) {
		return retainedKeys;
	}
	return visibleRowKeys[0] ? [visibleRowKeys[0]] : [];
}

function createBlockLookupSelectionState(
	state: BlockLookupWorkspaceSessionState,
	selectedRowKeys: string[],
	selectedRowKey: string | undefined,
	selectionAnchorRowKey: string | undefined,
	orderedRowKeys: string[]
): Pick<
	BlockLookupWorkspaceSessionState,
	'selectedRecord' | 'selectedRowKey' | 'selectedRowKeys' | 'selectedRowKeysInCopyOrder' | 'selectionAnchorRowKey'
> {
	const visibleRowKeySet = new Set(state.filteredRows.map((record) => getBlockLookupRecordKey(record)));
	const nextSelectedRowKeys = selectedRowKeys.filter((key) => visibleRowKeySet.has(key));
	const nextSelectedRowKey = selectedRowKey && visibleRowKeySet.has(selectedRowKey) ? selectedRowKey : nextSelectedRowKeys[0];
	const nextSelectionAnchorRowKey =
		selectionAnchorRowKey && visibleRowKeySet.has(selectionAnchorRowKey) ? selectionAnchorRowKey : nextSelectedRowKey;
	const selectedRowKeySet = new Set(nextSelectedRowKeys);
	const selectedRowKeysInCopyOrder = [
		...orderedRowKeys.filter((key) => selectedRowKeySet.has(key)),
		...nextSelectedRowKeys.filter((key) => !orderedRowKeys.includes(key))
	];

	return {
		selectedRecord: state.filteredRows.find((record) => getBlockLookupRecordKey(record) === nextSelectedRowKey),
		selectedRowKey: nextSelectedRowKey,
		selectedRowKeys: nextSelectedRowKeys,
		selectedRowKeysInCopyOrder,
		selectionAnchorRowKey: nextSelectionAnchorRowKey
	};
}

function reduceBlockLookupRowSelection(
	state: BlockLookupWorkspaceSessionState,
	event: Extract<BlockLookupWorkspaceSessionEvent, { type: 'selection-row-requested' }>
) {
	const orderedRowKeySet = new Set(event.orderedRowKeys);
	if (!orderedRowKeySet.has(event.rowKey)) {
		return state;
	}

	if (event.range) {
		const anchorKey =
			state.selectionAnchorRowKey && orderedRowKeySet.has(state.selectionAnchorRowKey)
				? state.selectionAnchorRowKey
				: state.selectedRowKey && orderedRowKeySet.has(state.selectedRowKey)
					? state.selectedRowKey
					: event.rowKey;
		return {
			...state,
			copyRowKeys: event.orderedRowKeys,
			...createBlockLookupSelectionState(
				state,
				getBlockLookupRowRange(event.orderedRowKeys, anchorKey, event.rowKey),
				event.rowKey,
				anchorKey,
				event.orderedRowKeys
			)
		};
	}

	if (event.toggle) {
		const selected = state.selectedRowKeys.includes(event.rowKey);
		const nextKeys = selected ? state.selectedRowKeys.filter((key) => key !== event.rowKey) : [...state.selectedRowKeys, event.rowKey];
		const nextSelectedRowKey = selected ? (nextKeys[0] ?? event.orderedRowKeys.find((key) => key !== event.rowKey)) : event.rowKey;
		return {
			...state,
			copyRowKeys: event.orderedRowKeys,
			...createBlockLookupSelectionState(state, nextKeys, nextSelectedRowKey, event.rowKey, event.orderedRowKeys)
		};
	}

	return {
		...state,
		copyRowKeys: event.orderedRowKeys,
		...createBlockLookupSelectionState(state, [event.rowKey], event.rowKey, event.rowKey, event.orderedRowKeys)
	};
}

import { getRows, type AppState } from 'model';
import type {
	BlockLookupBuildResult,
	BlockLookupBuildRequest,
	BlockLookupIndexStats,
	BlockLookupModSource,
	BlockLookupRecord,
	BlockLookupSearchResult,
	BlockLookupSettings
} from 'shared/block-lookup';
import type { BlockLookupColumnKey, BlockLookupSortDirection, BlockLookupSortKey } from 'renderer/state/block-lookup-store';

type BlockLookupWorkspaceAppState = Pick<AppState, 'mods'>;

interface BlockLookupSettingsState {
	settings: BlockLookupSettings;
	stats: BlockLookupIndexStats | null;
	workshopRoot: string;
}

interface BlockLookupWorkspaceSessionState extends BlockLookupSettingsState {
	loadingResults: boolean;
	rows: BlockLookupRecord[];
}

type BlockLookupWorkspaceSessionEvent =
	| { type: 'bootstrap-loaded'; settings: BlockLookupSettings; stats: BlockLookupIndexStats | null }
	| { type: 'build-index-completed'; result: BlockLookupBuildResult }
	| { type: 'search-completed'; result: BlockLookupSearchResult }
	| { type: 'search-finished' }
	| { type: 'search-started' }
	| { type: 'settings-saved'; settings: BlockLookupSettings }
	| { type: 'workshop-root-changed'; workshopRoot: string };

export function createBlockLookupWorkspaceSessionState(): BlockLookupWorkspaceSessionState {
	return {
		loadingResults: false,
		rows: [],
		settings: { workshopRoot: '' },
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
				...createBlockLookupBuildIndexState(event.result)
			};
		case 'search-completed':
			return {
				...state,
				loadingResults: false,
				rows: event.result.rows,
				stats: event.result.stats
			};
		case 'search-finished':
			return {
				...state,
				loadingResults: false
			};
		case 'search-started':
			return {
				...state,
				loadingResults: true
			};
		case 'settings-saved':
			return {
				...state,
				...createBlockLookupSettingsSaveState(event.settings, state.stats)
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

export function getBlockLookupRecordKey(record: BlockLookupRecord) {
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
	return getRows(appState.mods)
		.filter((mod) => !!mod.path)
		.map((mod) => ({
			uid: mod.uid,
			id: mod.id || undefined,
			name: mod.name,
			path: mod.path!,
			workshopID: mod.workshopID?.toString()
		}));
}

export function createBlockLookupBuildRequest(
	config: { gameExec: string },
	workshopRoot: string,
	modSources: BlockLookupModSource[],
	forceRebuild = false
): BlockLookupBuildRequest {
	return {
		workshopRoot,
		gameExec: config.gameExec,
		modSources,
		forceRebuild
	};
}

export function retainSelectedBlockLookupRow<T>(rows: readonly T[], currentKey: string | undefined, getRecordKey: (record: T) => string) {
	if (currentKey && rows.some((record) => getRecordKey(record) === currentKey)) {
		return currentKey;
	}

	return rows[0] ? getRecordKey(rows[0]) : undefined;
}

export function createBlockLookupSearchState(result: BlockLookupSearchResult, currentSelectedRowKey: string | undefined) {
	return {
		rows: result.rows,
		stats: result.stats,
		selectedRowKey: retainSelectedBlockLookupRow(result.rows, currentSelectedRowKey, getBlockLookupRecordKey)
	};
}

export function createBlockLookupBootstrapState(
	settings: BlockLookupSettings,
	stats: BlockLookupIndexStats | null
): BlockLookupSettingsState {
	return {
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

export function createBlockLookupBuildIndexState(result: BlockLookupBuildResult): BlockLookupSettingsState {
	return createBlockLookupBootstrapState(result.settings, result.stats);
}

export function getBlockLookupSortValue(record: BlockLookupRecord, sortKey: BlockLookupColumnKey) {
	switch (sortKey) {
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

export function sortBlockLookupRecords(rows: BlockLookupRecord[], sortKey: BlockLookupSortKey, sortDirection: BlockLookupSortDirection) {
	if (sortKey === 'relevance') {
		return rows;
	}

	const directionMultiplier = sortDirection === 'ascend' ? 1 : -1;
	return [...rows].sort((leftRecord, rightRecord) => {
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

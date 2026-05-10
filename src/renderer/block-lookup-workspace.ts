import { getRows, type AppState } from 'model';
import type { BlockLookupBuildRequest, BlockLookupIndexStats, BlockLookupModSource } from 'shared/block-lookup';

type BlockLookupWorkspaceAppState = Pick<AppState, 'mods'>;

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

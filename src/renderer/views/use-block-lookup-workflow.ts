import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppState } from 'model';
import api from 'renderer/Api';
import {
	collectBlockLookupModSources,
	createBlockLookupBootstrapCacheProjection,
	createBlockLookupBuildRequest,
	createBlockLookupSearchRequest,
	createBlockLookupWorkspaceSessionState,
	reduceBlockLookupWorkspaceSession
} from 'renderer/block-lookup-workspace';
import {
	fetchBlockLookupBootstrap,
	fetchBlockLookupSearch,
	invalidateBlockLookupSearchQueries,
	setBlockLookupBootstrapQueryData,
	useBuildBlockLookupIndexMutation
} from 'renderer/async-cache';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { measurePerfAsync } from 'renderer/perf';
import { formatErrorMessage } from 'renderer/util/error-message';

type BlockLookupWorkflowAppState = Pick<AppState, 'config' | 'mods'>;

interface BlockLookupWorkflowOptions {
	appState: BlockLookupWorkflowAppState;
}

export function useBlockLookupWorkflow({ appState }: BlockLookupWorkflowOptions) {
	const { openNotification } = useNotifications();
	const queryClient = useQueryClient();
	const [sessionState, dispatchSessionEvent] = useReducer(reduceBlockLookupWorkspaceSession, createBlockLookupWorkspaceSessionState());
	const {
		availableModFilters,
		buildingIndex,
		filteredRows,
		loadingResults,
		query,
		selectedFilterMods,
		selectedRecord,
		selectedRowKey,
		selectedRowKeys,
		selectedRowKeysInCopyOrder,
		settings,
		stats,
		workshopRoot,
		indexRunStatus
	} = sessionState;
	const { config: appConfig, mods } = appState;
	const { gameExec } = appConfig;
	const searchRequestIdRef = useRef(0);
	const skippedInitialSearchEffectRef = useRef(false);
	const queryRef = useRef(query);
	queryRef.current = query;
	const modSources = useMemo(() => collectBlockLookupModSources({ mods }), [mods]);

	const buildRequest = useCallback(
		(forceRebuild = false) => createBlockLookupBuildRequest({ gameExec }, workshopRoot, modSources, forceRebuild),
		[gameExec, modSources, workshopRoot]
	);
	const buildIndexMutation = useBuildBlockLookupIndexMutation();

	const refreshResults = useCallback(
		async (nextQuery: string) => {
			const requestId = searchRequestIdRef.current + 1;
			searchRequestIdRef.current = requestId;
			dispatchSessionEvent({ type: 'search-started', requestId });
			try {
				const request = createBlockLookupSearchRequest(nextQuery);
				const result = await measurePerfAsync('blockLookup.search.ipc', () => fetchBlockLookupSearch(queryClient, request), {
					queryLength: nextQuery.length
				});
				dispatchSessionEvent({ type: 'search-completed', requestId, result });
			} catch (error) {
				if (requestId !== searchRequestIdRef.current) {
					return;
				}
				api.logger.error(error);
				openNotification(
					{
						message: 'Block lookup search failed',
						description: formatErrorMessage(error),
						placement: 'topRight',
						duration: 3
					},
					'error'
				);
			} finally {
				if (requestId === searchRequestIdRef.current) {
					dispatchSessionEvent({ type: 'search-finished', requestId });
				}
			}
		},
		[openNotification, queryClient]
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [nextSettings, nextStats] = await fetchBlockLookupBootstrap(queryClient);
				if (cancelled) {
					return;
				}
				dispatchSessionEvent({ type: 'bootstrap-loaded', settings: nextSettings, stats: nextStats });
				await refreshResults(queryRef.current);
			} catch (error) {
				api.logger.error(error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [queryClient, refreshResults]);

	useEffect(() => {
		if (!skippedInitialSearchEffectRef.current) {
			skippedInitialSearchEffectRef.current = true;
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void refreshResults(query);
		}, 180);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [query, refreshResults]);

	useEffect(() => {
		if (!indexRunStatus || indexRunStatus.phase === 'running') {
			return;
		}

		const timeoutId = window.setTimeout(
			() => {
				dispatchSessionEvent({ type: 'build-index-status-cleared' });
			},
			indexRunStatus.phase === 'success' ? 5000 : 8000
		);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [indexRunStatus]);

	const handleSaveSettings = useCallback(async () => {
		try {
			const nextSettings = await api.saveBlockLookupSettings({ workshopRoot });
			const settingsState = reduceBlockLookupWorkspaceSession(sessionState, { type: 'settings-saved', settings: nextSettings });
			dispatchSessionEvent({ type: 'settings-saved', settings: nextSettings });
			setBlockLookupBootstrapQueryData(queryClient, createBlockLookupBootstrapCacheProjection(settingsState));
			openNotification(
				{
					message: 'Block lookup path saved',
					description: nextSettings.workshopRoot || 'Workshop root cleared.',
					placement: 'topRight',
					duration: 2
				},
				'success'
			);
		} catch (error) {
			api.logger.error(error);
			openNotification(
				{
					message: 'Could not save block lookup path',
					description: formatErrorMessage(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [openNotification, queryClient, sessionState, workshopRoot]);

	const handleBrowseWorkshopRoot = useCallback(async () => {
		const selectedPath = await api.selectPath(true, 'Select TerraTech workshop content folder');
		if (selectedPath) {
			dispatchSessionEvent({ type: 'workshop-root-changed', workshopRoot: selectedPath });
		}
	}, []);

	const handleAutoDetectWorkshopRoot = useCallback(async () => {
		try {
			const detectedRoot = await api.autoDetectBlockLookupWorkshopRoot(buildRequest(false));
			if (!detectedRoot) {
				openNotification(
					{
						message: 'Workshop root not found',
						description: 'No TerraTech workshop content folder was detected from the loaded mods or Steam libraries.',
						placement: 'topRight',
						duration: 3
					},
					'warn'
				);
				return;
			}
			dispatchSessionEvent({ type: 'workshop-root-changed', workshopRoot: detectedRoot });
		} catch (error) {
			api.logger.error(error);
			openNotification(
				{
					message: 'Auto-detect failed',
					description: formatErrorMessage(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [buildRequest, openNotification]);

	const handleBuildIndex = useCallback(
		async (forceRebuild = false) => {
			dispatchSessionEvent({ type: 'build-index-started', forceRebuild });
			try {
				const request = buildRequest(forceRebuild);
				const result = await measurePerfAsync('blockLookup.buildIndex.ipc', () => buildIndexMutation.mutateAsync(request), {
					forceRebuild,
					modSources: modSources.length
				});
				const buildState = reduceBlockLookupWorkspaceSession(sessionState, { type: 'build-index-completed', forceRebuild, result });
				dispatchSessionEvent({ type: 'build-index-completed', forceRebuild, result });
				setBlockLookupBootstrapQueryData(queryClient, createBlockLookupBootstrapCacheProjection(buildState));
				await invalidateBlockLookupSearchQueries(queryClient);
				await refreshResults(query);
				openNotification(
					{
						message: forceRebuild ? 'Block index rebuilt' : 'Block index updated',
						description: `${result.stats.blocks} blocks indexed from ${result.stats.sources} sources.`,
						placement: 'topRight',
						duration: 2
					},
					'success'
				);
			} catch (error) {
				api.logger.error(error);
				dispatchSessionEvent({ type: 'build-index-failed', forceRebuild, message: formatErrorMessage(error) });
				openNotification(
					{
						message: 'Block index update failed',
						description: formatErrorMessage(error),
						placement: 'topRight',
						duration: 4
					},
					'error'
				);
			} finally {
				dispatchSessionEvent({ type: 'build-index-finished' });
			}
		},
		[buildIndexMutation, buildRequest, modSources.length, openNotification, query, queryClient, refreshResults, sessionState]
	);

	const selectAllVisibleRows = useCallback((orderedRowKeys: string[]) => {
		dispatchSessionEvent({ type: 'selection-all-requested', orderedRowKeys });
	}, []);

	const selectBlockLookupRow = useCallback((rowKey: string, selection: { range: boolean; toggle: boolean }, orderedRowKeys: string[]) => {
		dispatchSessionEvent({ type: 'selection-row-requested', rowKey, orderedRowKeys, range: selection.range, toggle: selection.toggle });
	}, []);

	const selectSingleBlockLookupRow = useCallback((rowKey?: string) => {
		dispatchSessionEvent({ type: 'selection-single-requested', rowKey });
	}, []);

	const setQuery = useCallback((nextQuery: string) => {
		dispatchSessionEvent({ type: 'query-changed', query: nextQuery });
	}, []);

	const setSelectedFilterMods = useCallback((selectedMods: string[]) => {
		dispatchSessionEvent({ type: 'selected-filter-mods-changed', selectedMods });
	}, []);

	const setWorkshopRoot = useCallback((nextWorkshopRoot: string) => {
		dispatchSessionEvent({ type: 'workshop-root-changed', workshopRoot: nextWorkshopRoot });
	}, []);

	const syncSelectionCopyOrder = useCallback((orderedRowKeys: string[]) => {
		dispatchSessionEvent({ type: 'selection-copy-order-changed', orderedRowKeys });
	}, []);

	return {
		availableModFilters,
		buildingIndex,
		handleAutoDetectWorkshopRoot,
		handleBrowseWorkshopRoot,
		handleBuildIndex,
		indexRunStatus,
		handleSaveSettings,
		loadingResults,
		modSources,
		openNotification,
		query,
		refreshResults,
		rows: filteredRows,
		selectAllVisibleRows,
		selectBlockLookupRow,
		selectSingleBlockLookupRow,
		selectedRecord,
		selectedFilterMods,
		selectedRowKey,
		selectedRowKeys,
		selectedRowKeysInCopyOrder,
		setQuery,
		setSelectedFilterMods,
		setWorkshopRoot,
		syncSelectionCopyOrder,
		settings,
		stats,
		workshopRoot
	};
}

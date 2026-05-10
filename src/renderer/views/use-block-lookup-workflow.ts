import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppState } from 'model';
import api from 'renderer/Api';
import {
	collectBlockLookupModSources,
	createBlockLookupBuildRequest,
	createBlockLookupSearchState,
	createBlockLookupWorkspaceSessionState,
	getBlockLookupRecordKey,
	reduceBlockLookupWorkspaceSession
} from 'renderer/block-lookup-workspace';
import {
	fetchBlockLookupBootstrap,
	fetchBlockLookupSearch,
	setBlockLookupBootstrapQueryData,
	useBuildBlockLookupIndexMutation
} from 'renderer/async-cache';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { measurePerfAsync } from 'renderer/perf';
import { useBlockLookupStore } from 'renderer/state/block-lookup-store';

const MAX_SEARCH_RESULTS = 1000;

function createBlockLookupSearchRequest(query: string) {
	const trimmedQuery = query.trim();
	return {
		query,
		limit: trimmedQuery ? MAX_SEARCH_RESULTS : undefined
	};
}

type BlockLookupWorkflowAppState = Pick<AppState, 'config' | 'mods'>;

interface BlockLookupWorkflowOptions {
	appState: BlockLookupWorkflowAppState;
}

export function useBlockLookupWorkflow({ appState }: BlockLookupWorkflowOptions) {
	const { openNotification } = useNotifications();
	const queryClient = useQueryClient();
	const [sessionState, dispatchSessionEvent] = useReducer(reduceBlockLookupWorkspaceSession, createBlockLookupWorkspaceSessionState());
	const { loadingResults, rows, settings, stats, workshopRoot } = sessionState;
	const query = useBlockLookupStore((state) => state.query);
	const setQuery = useBlockLookupStore((state) => state.setQuery);
	const buildingIndex = useBlockLookupStore((state) => state.buildingIndex);
	const setBuildingIndex = useBlockLookupStore((state) => state.setBuildingIndex);
	const selectedRowKey = useBlockLookupStore((state) => state.selectedRowKey);
	const setSelectedRowKey = useBlockLookupStore((state) => state.setSelectedRowKey);
	const { config: appConfig, mods } = appState;
	const { gameExec } = appConfig;
	const searchRequestIdRef = useRef(0);
	const modSources = useMemo(() => collectBlockLookupModSources({ mods }), [mods]);
	const selectedRecord = useMemo(() => rows.find((record) => getBlockLookupRecordKey(record) === selectedRowKey), [rows, selectedRowKey]);

	const buildRequest = useCallback(
		(forceRebuild = false) => createBlockLookupBuildRequest({ gameExec }, workshopRoot, modSources, forceRebuild),
		[gameExec, modSources, workshopRoot]
	);
	const buildIndexMutation = useBuildBlockLookupIndexMutation();

	const refreshResults = useCallback(
		async (nextQuery: string) => {
			const requestId = searchRequestIdRef.current + 1;
			searchRequestIdRef.current = requestId;
			dispatchSessionEvent({ type: 'search-started' });
			try {
				const request = createBlockLookupSearchRequest(nextQuery);
				const result = await measurePerfAsync('blockLookup.search.ipc', () => fetchBlockLookupSearch(queryClient, request), {
					queryLength: nextQuery.length,
					limit: request.limit
				});
				if (requestId !== searchRequestIdRef.current) {
					return;
				}
				dispatchSessionEvent({ type: 'search-completed', result });
				setSelectedRowKey((current) => createBlockLookupSearchState(result, current).selectedRowKey);
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Block lookup search failed',
						description: String(error),
						placement: 'topRight',
						duration: 3
					},
					'error'
				);
			} finally {
				if (requestId === searchRequestIdRef.current) {
					dispatchSessionEvent({ type: 'search-finished' });
				}
			}
		},
		[openNotification, queryClient, setSelectedRowKey]
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
				await refreshResults('');
			} catch (error) {
				api.logger.error(error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [queryClient, refreshResults]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			void refreshResults(query);
		}, 180);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [query, refreshResults]);

	const handleSaveSettings = useCallback(async () => {
		try {
			const nextSettings = await api.saveBlockLookupSettings({ workshopRoot });
			const settingsState = reduceBlockLookupWorkspaceSession(sessionState, { type: 'settings-saved', settings: nextSettings });
			dispatchSessionEvent({ type: 'settings-saved', settings: nextSettings });
			setBlockLookupBootstrapQueryData(queryClient, [settingsState.settings, settingsState.stats]);
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
					description: String(error),
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
					description: String(error),
					placement: 'topRight',
					duration: 3
				},
				'error'
			);
		}
	}, [buildRequest, openNotification]);

	const handleBuildIndex = useCallback(
		async (forceRebuild = false) => {
			setBuildingIndex(true);
			try {
				const request = buildRequest(forceRebuild);
				const result = await measurePerfAsync('blockLookup.buildIndex.ipc', () => buildIndexMutation.mutateAsync(request), {
					forceRebuild,
					modSources: modSources.length
				});
				dispatchSessionEvent({ type: 'build-index-completed', result });
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
				openNotification(
					{
						message: 'Block index update failed',
						description: String(error),
						placement: 'topRight',
						duration: 4
					},
					'error'
				);
			} finally {
				setBuildingIndex(false);
			}
		},
		[buildIndexMutation, buildRequest, modSources.length, openNotification, query, refreshResults, setBuildingIndex]
	);

	return {
		buildingIndex,
		handleAutoDetectWorkshopRoot,
		handleBrowseWorkshopRoot,
		handleBuildIndex,
		handleSaveSettings,
		loadingResults,
		modSources,
		openNotification,
		query,
		refreshResults,
		rows,
		selectedRecord,
		selectedRowKey,
		setQuery,
		setSelectedRowKey,
		setWorkshopRoot: (nextWorkshopRoot: string) => {
			dispatchSessionEvent({ type: 'workshop-root-changed', workshopRoot: nextWorkshopRoot });
		},
		settings,
		stats,
		workshopRoot
	};
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppState } from 'model';
import type { BlockLookupRecord, BlockLookupSettings } from 'shared/block-lookup';
import api from 'renderer/Api';
import { collectBlockLookupModSources, createBlockLookupBuildRequest, retainSelectedBlockLookupRow } from 'renderer/block-lookup-workspace';
import { invalidateBlockLookupSearchQueries, queryKeys, setBlockLookupBootstrapQueryData } from 'renderer/async-cache';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { measurePerfAsync } from 'renderer/perf';
import { useBlockLookupStore } from 'renderer/state/block-lookup-store';

const MAX_SEARCH_RESULTS = 1000;

type BlockLookupWorkflowAppState = Pick<AppState, 'config' | 'mods'>;

interface BlockLookupWorkflowOptions {
	appState: BlockLookupWorkflowAppState;
}

export function getBlockLookupRecordKey(record: BlockLookupRecord) {
	return `${record.sourcePath}:${record.internalName}:${record.blockName}:${record.blockId}`;
}

export function useBlockLookupWorkflow({ appState }: BlockLookupWorkflowOptions) {
	const { openNotification } = useNotifications();
	const queryClient = useQueryClient();
	const [settings, setSettings] = useState<BlockLookupSettings>({ workshopRoot: '' });
	const [workshopRoot, setWorkshopRoot] = useState('');
	const query = useBlockLookupStore((state) => state.query);
	const setQuery = useBlockLookupStore((state) => state.setQuery);
	const rows = useBlockLookupStore((state) => state.rows);
	const setRows = useBlockLookupStore((state) => state.setRows);
	const stats = useBlockLookupStore((state) => state.stats);
	const setStats = useBlockLookupStore((state) => state.setStats);
	const loadingResults = useBlockLookupStore((state) => state.loadingResults);
	const setLoadingResults = useBlockLookupStore((state) => state.setLoadingResults);
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
	const buildIndexMutation = useMutation({
		mutationFn: (forceRebuild: boolean) =>
			measurePerfAsync('blockLookup.buildIndex.ipc', () => api.buildBlockLookupIndex(buildRequest(forceRebuild)), {
				forceRebuild,
				modSources: modSources.length
			})
	});

	const refreshResults = useCallback(
		async (nextQuery: string) => {
			const requestId = searchRequestIdRef.current + 1;
			searchRequestIdRef.current = requestId;
			setLoadingResults(true);
			try {
				const result = await queryClient.fetchQuery({
					queryKey: queryKeys.blockLookup.search(nextQuery, MAX_SEARCH_RESULTS),
					queryFn: () =>
						measurePerfAsync('blockLookup.search.ipc', () => api.searchBlockLookup({ query: nextQuery, limit: MAX_SEARCH_RESULTS }), {
							queryLength: nextQuery.length,
							limit: MAX_SEARCH_RESULTS
						})
				});
				if (requestId !== searchRequestIdRef.current) {
					return;
				}
				setRows(result.rows);
				setStats(result.stats);
				setSelectedRowKey((current) => {
					return retainSelectedBlockLookupRow(result.rows, current, getBlockLookupRecordKey);
				});
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
					setLoadingResults(false);
				}
			}
		},
		[openNotification, queryClient, setLoadingResults, setRows, setSelectedRowKey, setStats]
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [nextSettings, nextStats] = await queryClient.fetchQuery({
					queryKey: queryKeys.blockLookup.bootstrap(),
					queryFn: () => Promise.all([api.readBlockLookupSettings(), api.getBlockLookupStats()])
				});
				if (cancelled) {
					return;
				}
				setSettings(nextSettings);
				setWorkshopRoot(nextSettings.workshopRoot);
				setStats(nextStats);
				await refreshResults('');
			} catch (error) {
				api.logger.error(error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [queryClient, refreshResults, setStats]);

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
			setSettings(nextSettings);
			setWorkshopRoot(nextSettings.workshopRoot);
			setBlockLookupBootstrapQueryData(queryClient, [nextSettings, stats]);
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
	}, [openNotification, queryClient, stats, workshopRoot]);

	const handleBrowseWorkshopRoot = useCallback(async () => {
		const selectedPath = await api.selectPath(true, 'Select TerraTech workshop content folder');
		if (selectedPath) {
			setWorkshopRoot(selectedPath);
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
			setWorkshopRoot(detectedRoot);
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
				const result = await buildIndexMutation.mutateAsync(forceRebuild);
				setSettings(result.settings);
				setWorkshopRoot(result.settings.workshopRoot);
				setStats(result.stats);
				setBlockLookupBootstrapQueryData(queryClient, [result.settings, result.stats]);
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
		[buildIndexMutation, openNotification, query, queryClient, refreshResults, setBuildingIndex, setStats]
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
		setWorkshopRoot,
		settings,
		stats,
		workshopRoot
	};
}

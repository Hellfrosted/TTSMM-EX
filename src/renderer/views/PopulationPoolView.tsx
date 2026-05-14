import { RefreshCw } from 'lucide-react';
import type { AppConfig, PopulationPoolColumnKey } from 'model';
import { POPULATION_POOL_COLUMN_KEYS } from 'model';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PopulationPoolRow, PopulationPoolScanRequest, PopulationPoolScanResult, PopulationPoolSource } from 'shared/population-pool';
import { POPULATION_POOL_COLUMN_TITLES } from 'shared/population-pool';
import { normalizedOrder } from 'shared/view-config';
import { DesktopButton, DesktopIconButton, DesktopInput } from '../components/DesktopControls';

interface PopulationPoolViewProps {
	appState: {
		config: AppConfig;
		updateState: (state: Partial<{ config: AppConfig }>) => void;
	};
}

const SOURCE_FILTERS: Array<{ source: PopulationPoolSource; label: string }> = [
	{ source: 'active', label: 'Active Population Entries' },
	{ source: 'disabled', label: 'Disabled Population Entries' },
	{ source: 'saved-candidate', label: 'Saved Tech Candidates' },
	{ source: 'workshop-candidate', label: 'Workshop Tech Candidates' },
	{ source: 'workshop-request', label: 'Workshop Population Requests' }
];

const DEFAULT_SCAN_RESULT: PopulationPoolScanResult = { rows: [], pathStatuses: [], warnings: [] };

function getColumnWidth(config: AppConfig, column: PopulationPoolColumnKey) {
	return config.viewConfigs.populationPool?.columnWidthConfig?.[column];
}

function getVisibleColumns(config: AppConfig) {
	const poolConfig = config.viewConfigs.populationPool;
	return normalizedOrder(poolConfig?.columnOrder, POPULATION_POOL_COLUMN_KEYS).filter(
		(column) => poolConfig?.columnActiveConfig?.[column] !== false
	);
}

function getCellValue(row: PopulationPoolRow, column: PopulationPoolColumnKey) {
	switch (column) {
		case 'name':
			return row.name;
		case 'source':
			return row.sourceLabel;
		case 'status':
			return row.status;
		case 'compatibility':
			return row.compatibilityLabel;
		case 'path':
			return row.path || row.workshopId || '';
	}
}

function cloneConfigWithPopulationPool(config: AppConfig, update: NonNullable<AppConfig['viewConfigs']['populationPool']>): AppConfig {
	return {
		...config,
		viewConfigs: {
			...config.viewConfigs,
			populationPool: {
				...config.viewConfigs.populationPool,
				...update
			}
		}
	};
}

// fallow-ignore-next-line unused-export
export function PopulationPoolView({ appState }: PopulationPoolViewProps) {
	const { config, updateState } = appState;
	const [scanResult, setScanResult] = useState(DEFAULT_SCAN_RESULT);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [query, setQuery] = useState('');
	const [enabledSources, setEnabledSources] = useState<Set<PopulationPoolSource>>(
		() => new Set(SOURCE_FILTERS.map((filter) => filter.source))
	);
	const [selectedRowId, setSelectedRowId] = useState<string | undefined>();
	const [operationMessage, setOperationMessage] = useState<string | undefined>();

	const selectedRow = scanResult.rows.find((row) => row.id === selectedRowId) || scanResult.rows[0];
	const visibleColumns = useMemo(() => getVisibleColumns(config), [config]);
	const filteredRows = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return scanResult.rows.filter((row) => {
			if (!enabledSources.has(row.source)) {
				return false;
			}
			if (!normalizedQuery) {
				return true;
			}
			return [row.name, row.sourceLabel, row.status, row.compatibilityLabel, row.path, row.workshopId]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(normalizedQuery));
		});
	}, [enabledSources, query, scanResult.rows]);

	const createScanRequest = useCallback(async (): Promise<PopulationPoolScanRequest> => {
		const blockLookupSettings = await window.electron.readBlockLookupSettings();
		return {
			localDir: config.localDir,
			gameExec: config.gameExec,
			workshopRoot: blockLookupSettings.workshopRoot
		};
	}, [config.gameExec, config.localDir]);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(undefined);
		try {
			const scanRequest = await createScanRequest();
			const result = await window.electron.scanPopulationPool(scanRequest);
			setScanResult(result);
			setSelectedRowId((current) => (current && result.rows.some((row) => row.id === current) ? current : result.rows[0]?.id));
		} catch (scanError) {
			setError(scanError instanceof Error ? scanError.message : String(scanError));
		} finally {
			setLoading(false);
		}
	}, [createScanRequest]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const persistConfig = useCallback(
		async (nextConfig: AppConfig) => {
			const persistedConfig = await window.electron.updateConfig(nextConfig);
			if (persistedConfig) {
				updateState({ config: persistedConfig });
			}
		},
		[updateState]
	);

	const updateColumnVisibility = useCallback(
		(column: PopulationPoolColumnKey, visible: boolean) => {
			const nextConfig = cloneConfigWithPopulationPool(config, {
				columnActiveConfig: {
					...config.viewConfigs.populationPool?.columnActiveConfig,
					[column]: visible
				}
			});
			void persistConfig(nextConfig);
		},
		[config, persistConfig]
	);

	const updateColumnWidth = useCallback(
		(column: PopulationPoolColumnKey, width: number) => {
			const nextConfig = cloneConfigWithPopulationPool(config, {
				columnWidthConfig: {
					...config.viewConfigs.populationPool?.columnWidthConfig,
					[column]: width
				}
			});
			void persistConfig(nextConfig);
		},
		[config, persistConfig]
	);

	const moveColumn = useCallback(
		(column: PopulationPoolColumnKey, direction: -1 | 1) => {
			const currentOrder = normalizedOrder(config.viewConfigs.populationPool?.columnOrder, POPULATION_POOL_COLUMN_KEYS);
			const fromIndex = currentOrder.indexOf(column);
			const toIndex = fromIndex + direction;
			if (fromIndex < 0 || toIndex < 0 || toIndex >= currentOrder.length) {
				return;
			}
			const nextOrder = [...currentOrder];
			nextOrder.splice(fromIndex, 1);
			nextOrder.splice(toIndex, 0, column);
			void persistConfig(cloneConfigWithPopulationPool(config, { columnOrder: nextOrder }));
		},
		[config, persistConfig]
	);

	const updateCompactRows = useCallback(
		(smallRows: boolean) => {
			void persistConfig(cloneConfigWithPopulationPool(config, { smallRows }));
		},
		[config, persistConfig]
	);

	const runOperation = useCallback(
		async (operation: 'disable' | 'restore' | 'stable-add' | 'workshop-request', row: PopulationPoolRow) => {
			setOperationMessage(undefined);
			const scanRequest = await createScanRequest();
			if (operation === 'workshop-request') {
				await window.electron.createWorkshopPopulationRequest({ row, scanRequest });
				setOperationMessage('Workshop Population Request saved.');
				await refresh();
				return;
			}
			let gameRunning = false;
			try {
				gameRunning = await window.electron.isGameRunning();
			} catch {
				const continueAfterCaution = window.confirm(
					'Running-game detection failed. This write affects TACtical_AI local population files. Continue?'
				);
				if (!continueAfterCaution) {
					setOperationMessage('Population Pool write cancelled because running-game detection failed.');
					return;
				}
			}
			const confirmedWhileGameRunning =
				!gameRunning || window.confirm('TerraTech appears to be running. This write affects TACtical_AI local population files. Continue?');
			if (!confirmedWhileGameRunning) {
				setOperationMessage('Population Pool write cancelled while TerraTech is running.');
				return;
			}
			const result =
				operation === 'disable'
					? await window.electron.disablePopulationEntry({ row, localDir: config.localDir, confirmedWhileGameRunning, scanRequest })
					: operation === 'restore'
						? await window.electron.restorePopulationEntry({ row, localDir: config.localDir, confirmedWhileGameRunning, scanRequest })
						: await window.electron.addStablePopulationEntry({ row, localDir: config.localDir, confirmedWhileGameRunning, scanRequest });
			setScanResult(result);
			setOperationMessage(result.operationStatus);
		},
		[config.localDir, createScanRequest, refresh]
	);

	return (
		<main className="PopulationPoolView">
			<header className="PopulationPoolHeader">
				<div>
					<h1>Population Pool</h1>
					<p>Scanner-backed TAC population membership and candidates.</p>
				</div>
				<DesktopIconButton aria-label="Refresh Population Pool" disabled={loading} onClick={() => void refresh()}>
					<RefreshCw size={16} />
				</DesktopIconButton>
			</header>

			<section className="PopulationPathStatus" aria-label="Population Path Status">
				{scanResult.pathStatuses.map((status) => (
					<div key={status.key} className="PopulationPathStatusItem" data-state={status.state}>
						<strong>{status.label}</strong>
						<span>{status.message}</span>
						<code>{status.path || 'Not detected'}</code>
					</div>
				))}
			</section>

			<div className="PopulationPoolToolbar">
				<DesktopInput
					aria-label="Search Population Pool"
					placeholder="Search Population Pool"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<label className="PopulationPoolCompactToggle">
					<input
						type="checkbox"
						checked={!!config.viewConfigs.populationPool?.smallRows}
						onChange={(event) => updateCompactRows(event.target.checked)}
					/>
					<span>Compact rows</span>
				</label>
			</div>

			<div className="PopulationPoolFilters" role="group" aria-label="Population Pool source filters">
				{SOURCE_FILTERS.map((filter) => (
					<button
						type="button"
						key={filter.source}
						aria-pressed={enabledSources.has(filter.source)}
						onClick={() =>
							setEnabledSources((current) => {
								const next = new Set(current);
								if (next.has(filter.source)) {
									next.delete(filter.source);
								} else {
									next.add(filter.source);
								}
								return next;
							})
						}
					>
						{filter.label}
					</button>
				))}
			</div>

			<div className="PopulationPoolContent">
				<section className="PopulationPoolTablePane" aria-label="Population Pool table">
					<div className="PopulationPoolColumnControls" role="group" aria-label="Population Pool table settings">
						{POPULATION_POOL_COLUMN_KEYS.map((column) => (
							<label key={column}>
								<input
									type="checkbox"
									checked={config.viewConfigs.populationPool?.columnActiveConfig?.[column] !== false}
									onChange={(event) => updateColumnVisibility(column, event.target.checked)}
								/>
								<span>{POPULATION_POOL_COLUMN_TITLES[column]}</span>
								<input
									aria-label={`Saved width for ${POPULATION_POOL_COLUMN_TITLES[column]} column`}
									type="number"
									min={120}
									value={getColumnWidth(config, column) ?? ''}
									placeholder="Auto"
									onChange={(event) => updateColumnWidth(column, Number(event.target.value))}
								/>
								<button
									type="button"
									aria-label={`Move ${POPULATION_POOL_COLUMN_TITLES[column]} column left`}
									onClick={() => moveColumn(column, -1)}
								>
									Left
								</button>
								<button
									type="button"
									aria-label={`Move ${POPULATION_POOL_COLUMN_TITLES[column]} column right`}
									onClick={() => moveColumn(column, 1)}
								>
									Right
								</button>
							</label>
						))}
					</div>
					<table className="PopulationPoolTable" data-compact={config.viewConfigs.populationPool?.smallRows ? 'true' : 'false'}>
						<thead>
							<tr>
								{visibleColumns.map((column) => (
									<th key={column} style={{ width: getColumnWidth(config, column) }}>
										{POPULATION_POOL_COLUMN_TITLES[column]}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{filteredRows.map((row) => (
								<tr
									key={row.id}
									data-source={row.source}
									data-selected={row.id === selectedRow?.id}
									onClick={() => setSelectedRowId(row.id)}
								>
									{visibleColumns.map((column) => (
										<td key={column}>{getCellValue(row, column) || 'Unavailable'}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{filteredRows.length === 0 ? (
						<p className="PopulationPoolEmptyState">No Population Pool rows match the current source filters.</p>
					) : null}
					{error ? <p className="PopulationPoolError">{error}</p> : null}
					{scanResult.warnings.map((warning) => (
						<p key={warning} className="PopulationPoolWarning">
							{warning}
						</p>
					))}
				</section>

				<aside className="PopulationPoolInspector" aria-label="Population Pool inspector">
					{selectedRow ? (
						<>
							<h2>{selectedRow.name}</h2>
							<p>{selectedRow.sourceLabel}</p>
							<p>{selectedRow.compatibilityLabel}</p>
							{selectedRow.previewUrl ? <img src={selectedRow.previewUrl} alt="" /> : null}
							<p>{selectedRow.detail || selectedRow.status}</p>
							<code>{selectedRow.path || selectedRow.workshopId || 'No file path'}</code>
							<div className="PopulationPoolInspectorActions">
								<DesktopButton disabled={!selectedRow.canStableAdd} onClick={() => void runOperation('stable-add', selectedRow)}>
									Stable add
								</DesktopButton>
								<DesktopButton disabled={!selectedRow.canDisable} onClick={() => void runOperation('disable', selectedRow)}>
									Disable
								</DesktopButton>
								<DesktopButton disabled={!selectedRow.canRestore} onClick={() => void runOperation('restore', selectedRow)}>
									Restore
								</DesktopButton>
								<DesktopButton
									disabled={!selectedRow.canRequestWorkshopAdd}
									onClick={() => void runOperation('workshop-request', selectedRow)}
								>
									Experimental Workshop Population Add
								</DesktopButton>
							</div>
							{operationMessage ? <p>{operationMessage}</p> : null}
						</>
					) : (
						<p>Select a Population Pool row.</p>
					)}
				</aside>
			</div>
		</main>
	);
}

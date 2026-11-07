import { RefreshCw, Search } from 'lucide-react';
import type { AppConfig, PopulationPoolColumnKey } from 'model';
import { POPULATION_POOL_COLUMN_KEYS } from 'model';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
type PopulationPoolOperation = 'disable' | 'restore' | 'stable-add' | 'workshop-request';

async function confirmPopulationWrite(): Promise<string | undefined> {
	let gameRunning: boolean;
	try {
		gameRunning = await window.electron.isGameRunning();
	} catch {
		return window.confirm('Running-game detection failed. This write affects TACtical_AI local population files. Continue?')
			? undefined
			: 'Population Pool write cancelled because running-game detection failed.';
	}
	if (gameRunning && !window.confirm('TerraTech appears to be running. This write affects TACtical_AI local population files. Continue?')) {
		return 'Population Pool write cancelled while TerraTech is running.';
	}
	return undefined;
}

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

function PopulationPoolColumnControls({
	config,
	onVisibilityChange,
	onWidthChange,
	onMove
}: {
	config: AppConfig['viewConfigs']['populationPool'];
	onVisibilityChange: (column: PopulationPoolColumnKey, visible: boolean) => void;
	onWidthChange: (column: PopulationPoolColumnKey, width: number | undefined) => void;
	onMove: (column: PopulationPoolColumnKey, direction: -1 | 1) => void;
}) {
	return (
		<div className="PopulationPoolColumnControls" role="group" aria-label="Population Pool table settings">
			{POPULATION_POOL_COLUMN_KEYS.map((column) => (
				<div key={column} className="PopulationPoolColumnControl">
					<label>
						<input
							type="checkbox"
							checked={config?.columnActiveConfig?.[column] !== false}
							onChange={(event) => onVisibilityChange(column, event.target.checked)}
						/>
						<span>{POPULATION_POOL_COLUMN_TITLES[column]}</span>
					</label>
					<input
						aria-label={`Saved width for ${POPULATION_POOL_COLUMN_TITLES[column]} column`}
						type="number"
						min={120}
						value={config?.columnWidthConfig?.[column] ?? ''}
						placeholder="Auto"
						onChange={(event) => {
							const width = event.currentTarget.valueAsNumber;
							onWidthChange(column, Number.isFinite(width) ? width : undefined);
						}}
					/>
					<button type="button" aria-label={`Move ${POPULATION_POOL_COLUMN_TITLES[column]} column left`} onClick={() => onMove(column, -1)}>
						Left
					</button>
					<button type="button" aria-label={`Move ${POPULATION_POOL_COLUMN_TITLES[column]} column right`} onClick={() => onMove(column, 1)}>
						Right
					</button>
				</div>
			))}
		</div>
	);
}

function PopulationPoolActions({
	row,
	busy,
	onOperation
}: {
	row: PopulationPoolRow;
	busy: boolean;
	onOperation: (operation: PopulationPoolOperation, row: PopulationPoolRow) => Promise<void>;
}) {
	return (
		<div className="PopulationPoolInspectorActions">
			<DesktopButton disabled={busy || !row.canStableAdd} onClick={() => void onOperation('stable-add', row)}>
				Stable add
			</DesktopButton>
			<DesktopButton disabled={busy || !row.canDisable} onClick={() => void onOperation('disable', row)}>
				Disable
			</DesktopButton>
			<DesktopButton disabled={busy || !row.canRestore} onClick={() => void onOperation('restore', row)}>
				Restore
			</DesktopButton>
			<DesktopButton disabled={busy || !row.canRequestWorkshopAdd} onClick={() => void onOperation('workshop-request', row)}>
				Experimental Workshop Population Add
			</DesktopButton>
		</div>
	);
}

function PopulationPoolInspector({
	row,
	operationMessage,
	busy,
	onOperation
}: {
	row: PopulationPoolRow | undefined;
	operationMessage: string | undefined;
	busy: boolean;
	onOperation: (operation: PopulationPoolOperation, row: PopulationPoolRow) => Promise<void>;
}) {
	return (
		<aside className="PopulationPoolInspector" aria-label="Population Pool inspector">
			{row ? (
				<>
					<h2>{row.name}</h2>
					<p>{row.sourceLabel}</p>
					<p>{row.compatibilityLabel}</p>
					{row.previewUrl ? <img src={row.previewUrl} alt="" /> : null}
					<p>{row.detail || row.status}</p>
					<code>{row.path || row.workshopId || 'No file path'}</code>
					<PopulationPoolActions row={row} busy={busy} onOperation={onOperation} />
					{operationMessage ? <p>{operationMessage}</p> : null}
				</>
			) : (
				<p>Select a Population Pool row.</p>
			)}
		</aside>
	);
}

function usePopulationPoolSettings(
	config: AppConfig,
	updateState: PopulationPoolViewProps['appState']['updateState'],
	setError: (message: string) => void
) {
	const configRef = useRef(config);
	const persistedConfigRef = useRef(config);
	const configWrites = useRef(Promise.resolve());
	const pendingConfigWrites = useRef(0);
	useEffect(() => {
		if (pendingConfigWrites.current === 0) {
			configRef.current = config;
			persistedConfigRef.current = config;
		}
	}, [config]);
	const persistConfig = useCallback(
		(update: (config: AppConfig) => AppConfig) => {
			const nextConfig = update(configRef.current);
			configRef.current = nextConfig;
			pendingConfigWrites.current++;
			updateState({ config: nextConfig });
			configWrites.current = configWrites.current.then(async () => {
				try {
					const baseConfig = persistedConfigRef.current;
					const persistedConfig = await window.electron.updateConfig(update(baseConfig), baseConfig);
					if (!persistedConfig) throw new Error('Could not save Population Pool settings');
					persistedConfigRef.current = persistedConfig;
				} catch (error) {
					setError(error instanceof Error ? error.message : String(error));
				} finally {
					pendingConfigWrites.current--;
					if (pendingConfigWrites.current === 0) {
						configRef.current = persistedConfigRef.current;
						updateState({ config: persistedConfigRef.current });
					}
				}
			});
		},
		[setError, updateState]
	);

	const updateColumnVisibility = useCallback(
		(column: PopulationPoolColumnKey, visible: boolean) => {
			persistConfig((config) =>
				cloneConfigWithPopulationPool(config, {
					columnActiveConfig: {
						...config.viewConfigs.populationPool?.columnActiveConfig,
						[column]: visible
					}
				})
			);
		},
		[persistConfig]
	);

	const updateColumnWidth = useCallback(
		(column: PopulationPoolColumnKey, width: number | undefined) => {
			persistConfig((config) => {
				const columnWidthConfig = { ...config.viewConfigs.populationPool?.columnWidthConfig };
				if (width === undefined) {
					delete columnWidthConfig[column];
				} else {
					columnWidthConfig[column] = width;
				}
				return cloneConfigWithPopulationPool(config, {
					columnWidthConfig
				});
			});
		},
		[persistConfig]
	);

	const moveColumn = useCallback(
		(column: PopulationPoolColumnKey, direction: -1 | 1) => {
			persistConfig((config) => {
				const currentOrder = normalizedOrder(config.viewConfigs.populationPool?.columnOrder, POPULATION_POOL_COLUMN_KEYS);
				const fromIndex = currentOrder.indexOf(column);
				const toIndex = fromIndex + direction;
				if (fromIndex < 0 || toIndex < 0 || toIndex >= currentOrder.length) {
					return config;
				}
				const nextOrder = [...currentOrder];
				nextOrder.splice(fromIndex, 1);
				nextOrder.splice(toIndex, 0, column);
				return cloneConfigWithPopulationPool(config, { columnOrder: nextOrder });
			});
		},
		[persistConfig]
	);

	const updateCompactRows = useCallback(
		(smallRows: boolean) => {
			persistConfig((config) => cloneConfigWithPopulationPool(config, { smallRows }));
		},
		[persistConfig]
	);

	return { updateColumnVisibility, updateColumnWidth, moveColumn, updateCompactRows };
}

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
	const refreshRequestId = useRef(0);
	const operationPending = useRef(false);
	const [operationBusy, setOperationBusy] = useState(false);

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
	const selectedRow = filteredRows.find((row) => row.id === selectedRowId) || filteredRows[0];

	const createScanRequest = useCallback(async (): Promise<PopulationPoolScanRequest> => {
		const blockLookupSettings = await window.electron.readBlockLookupSettings();
		return {
			localDir: config.localDir,
			gameExec: config.gameExec,
			workshopRoot: blockLookupSettings.workshopRoot
		};
	}, [config.gameExec, config.localDir]);

	const refresh = useCallback(async () => {
		const requestId = ++refreshRequestId.current;
		setLoading(true);
		setError(undefined);
		try {
			const scanRequest = await createScanRequest();
			const result = await window.electron.scanPopulationPool(scanRequest);
			if (requestId !== refreshRequestId.current) return;
			setScanResult(result);
			setSelectedRowId((current) => (current && result.rows.some((row) => row.id === current) ? current : result.rows[0]?.id));
		} catch (scanError) {
			if (requestId === refreshRequestId.current) setError(scanError instanceof Error ? scanError.message : String(scanError));
		} finally {
			if (requestId === refreshRequestId.current) setLoading(false);
		}
	}, [createScanRequest]);

	useEffect(() => {
		void refresh();
		return () => {
			refreshRequestId.current++;
		};
	}, [refresh]);

	const { updateColumnVisibility, updateColumnWidth, moveColumn, updateCompactRows } = usePopulationPoolSettings(
		config,
		updateState,
		setError
	);

	const runOperation = useCallback(
		async (operation: PopulationPoolOperation, row: PopulationPoolRow) => {
			if (operationPending.current) return;
			operationPending.current = true;
			setOperationBusy(true);
			refreshRequestId.current++;
			setLoading(false);
			setOperationMessage(undefined);
			try {
				const scanRequest = await createScanRequest();
				if (operation === 'workshop-request') {
					await window.electron.createWorkshopPopulationRequest({ row, scanRequest });
					setOperationMessage('Workshop Population Request saved.');
					await refresh();
					return;
				}
				const cancellation = await confirmPopulationWrite();
				if (cancellation) {
					setOperationMessage(cancellation);
					return;
				}
				const confirmedWhileGameRunning = true;
				const result =
					operation === 'disable'
						? await window.electron.disablePopulationEntry({ row, localDir: config.localDir, confirmedWhileGameRunning, scanRequest })
						: operation === 'restore'
							? await window.electron.restorePopulationEntry({ row, localDir: config.localDir, confirmedWhileGameRunning, scanRequest })
							: await window.electron.addStablePopulationEntry({ row, localDir: config.localDir, confirmedWhileGameRunning, scanRequest });
				refreshRequestId.current++;
				setLoading(false);
				setScanResult(result);
				setOperationMessage(result.operationStatus);
			} catch (error) {
				setOperationMessage(error instanceof Error ? error.message : String(error));
			} finally {
				operationPending.current = false;
				setOperationBusy(false);
			}
		},
		[config.localDir, createScanRequest, refresh]
	);

	return (
		<main className="PopulationPoolView">
			<header className="WorkspaceHeader PopulationPoolHeader">
				<div className="PopulationPoolTitle">
					<h1>Population Pool</h1>
					<p>Scanner-backed TAC population membership and candidates.</p>
				</div>

				<div className="PopulationPoolToolbar">
					<div className="PopulationPoolSearchControl">
						<Search className="PopulationPoolSearchIcon" size={16} aria-hidden="true" />
						<DesktopInput
							aria-label="Search Population Pool"
							placeholder="Search tech, source, status, path"
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
					<label className="PopulationPoolCompactToggle">
						<input
							type="checkbox"
							checked={!!config.viewConfigs.populationPool?.smallRows}
							onChange={(event) => updateCompactRows(event.target.checked)}
						/>
						<span>Compact rows</span>
					</label>
					<DesktopIconButton aria-label="Refresh Population Pool" disabled={loading} onClick={() => void refresh()}>
						<RefreshCw size={16} aria-hidden="true" />
					</DesktopIconButton>
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

				<section className="PopulationPathStatus" aria-label="Population Path Status">
					{scanResult.pathStatuses.map((status) => (
						<div key={status.key} className="PopulationPathStatusItem" data-state={status.state}>
							<strong>{status.label}</strong>
							<span>{status.message}</span>
							<code>{status.path || 'Not detected'}</code>
						</div>
					))}
				</section>
			</header>

			<div className="PopulationPoolContent">
				<section className="PopulationPoolTablePane" aria-label="Population Pool table">
					<PopulationPoolColumnControls
						config={config.viewConfigs.populationPool}
						onVisibilityChange={updateColumnVisibility}
						onWidthChange={updateColumnWidth}
						onMove={moveColumn}
					/>
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
									aria-selected={row.id === selectedRow?.id}
									tabIndex={0}
									onClick={() => setSelectedRowId(row.id)}
									onKeyDown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											setSelectedRowId(row.id);
										}
									}}
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

				<PopulationPoolInspector row={selectedRow} operationMessage={operationMessage} busy={operationBusy} onOperation={runOperation} />
			</div>
		</main>
	);
}

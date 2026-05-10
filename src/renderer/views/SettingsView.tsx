import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AppState } from 'model';
import { AppConfigKeys, LogLevel, NLogLevel, SettingsViewModalType } from 'model';
import { useOutletContext } from 'react-router-dom';
import { Edit3, Folder, Plus, X } from 'lucide-react';
import {
	DesktopButton,
	DesktopDialog as SettingsDialog,
	DesktopInlineControls,
	DesktopInput,
	DesktopSelect as SettingsSelect,
	DesktopSwitch as SettingsSwitch
} from 'renderer/components/DesktopControls';
import { useSettingsForm } from 'renderer/hooks/useSettingsForm';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { getSettingsFormErrors } from 'renderer/settings-validation';
import { validateSettingsPath } from 'util/Validation';

type SettingsViewAppState = Pick<AppState, 'config' | 'configErrors' | 'madeConfigEdits' | 'savingConfig' | 'updateState'>;

interface SettingsViewProps {
	appState: SettingsViewAppState;
}

type SettingsConfigErrors = Record<string, string>;

const APP_LOG_LEVEL_OPTIONS = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.VERBOSE, LogLevel.DEBUG, LogLevel.SILLY] as const;
const NLOG_LEVEL_OPTIONS = [
	NLogLevel.OFF,
	NLogLevel.FATAL,
	NLogLevel.ERROR,
	NLogLevel.WARN,
	NLogLevel.INFO,
	NLogLevel.DEBUG,
	NLogLevel.TRACE
] as const;

interface SettingsFieldProps {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	extra?: ReactNode;
	tooltip?: string;
	children: ReactNode;
}

function formatLogLevelLabel(level: string) {
	return level.toUpperCase();
}

function parseWorkshopIDInput(value: string) {
	const digits = value.replace(/[^\d]/g, '');
	return BigInt(digits || 0);
}

async function getSettingsPathError(field: string, value: string | undefined) {
	if (!value || value.length === 0) {
		if (field === AppConfigKeys.LOCAL_DIR || field === AppConfigKeys.LOGS_DIR) {
			return undefined;
		}
		return 'Path is required';
	}

	return validateSettingsPath(field, value);
}

function SettingsField({ id, label, required, error, extra, tooltip, children }: SettingsFieldProps) {
	const helpId = `${id}-help`;
	const errorId = `${id}-error`;
	return (
		<div className="mb-4 grid w-full grid-cols-[minmax(10rem,0.42fr)_minmax(0,0.58fr)] items-start gap-x-4 gap-y-2 last:mb-0 max-[1199px]:grid-cols-1">
			<label className="min-h-control whitespace-normal pt-2 text-base leading-[1.35] text-text" htmlFor={id} title={tooltip}>
				{required ? <span className="mr-1 text-error">*</span> : null}
				{label}
			</label>
			<div className="flex min-w-0 flex-col gap-1.5">
				{children}
				{extra ? (
					<div className="text-xs leading-[1.35] text-text-muted" id={helpId}>
						{extra}
					</div>
				) : null}
				{error ? (
					<div className="text-xs font-[650] leading-[1.35] text-error" id={errorId} role="alert">
						{error}
					</div>
				) : null}
			</div>
		</div>
	);
}

function useSettingsViewController({ appState }: SettingsViewProps) {
	const { config, configErrors: appConfigErrors, madeConfigEdits, savingConfig, updateState } = appState;
	const isLinux = window.electron.platform === 'linux';
	const { openNotification } = useNotifications();
	const [loggingOverridesOpen, setLoggingOverridesOpen] = useState(false);
	const configErrors = appConfigErrors || {};
	const {
		editingConfig,
		form,
		selectingDirectory,
		modalType,
		editingContextIndex,
		editingContext,
		setField,
		updateLogConfig,
		addLogConfig,
		removeLogConfig,
		selectPath,
		saveChanges,
		cancelChanges,
		openLogEditModal,
		openWorkshopIdModal,
		closeModal
	} = useSettingsForm(appState);

	useEffect(() => {
		if (editingConfig.editingLogConfig.length > 0) {
			setLoggingOverridesOpen(true);
		}
	}, [editingConfig.editingLogConfig.length]);

	const commitConfigErrors = useCallback(
		(nextErrors: SettingsConfigErrors) => {
			updateState({ configErrors: nextErrors });
		},
		[updateState]
	);

	const updateConfigErrors = useCallback(
		(field: string, error?: string) => {
			const currentError = configErrors?.[field];
			if (currentError === error) {
				return;
			}

			const nextErrors = { ...(configErrors || {}) };
			if (error) {
				nextErrors[field] = error;
			} else {
				delete nextErrors[field];
			}
			commitConfigErrors(nextErrors);
		},
		[commitConfigErrors, configErrors]
	);

	const validateFile = useCallback(
		async (field: string, value: string) => {
			try {
				const error = await getSettingsPathError(field, value);
				if (error) {
					updateConfigErrors(field, error);
					throw new Error(error);
				}

				updateConfigErrors(field);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				updateConfigErrors(field, message);
				throw new Error(message);
			}
		},
		[updateConfigErrors]
	);

	const validateSettingsBeforeSave = useCallback(async () => {
		const nextErrors: SettingsConfigErrors = {};
		const [localDirError, logsDirError, gameExecError] = await Promise.all([
			getSettingsPathError(AppConfigKeys.LOCAL_DIR, editingConfig.localDir),
			getSettingsPathError(AppConfigKeys.LOGS_DIR, editingConfig.logsDir),
			isLinux ? Promise.resolve(undefined) : getSettingsPathError(AppConfigKeys.GAME_EXEC, editingConfig.gameExec)
		]);
		if (localDirError) {
			nextErrors[AppConfigKeys.LOCAL_DIR] = localDirError;
		}
		if (logsDirError) {
			nextErrors[AppConfigKeys.LOGS_DIR] = logsDirError;
		}
		if (gameExecError) {
			nextErrors[AppConfigKeys.GAME_EXEC] = gameExecError;
		}

		Object.assign(nextErrors, getSettingsFormErrors(editingConfig));

		commitConfigErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	}, [commitConfigErrors, editingConfig, isLinux]);

	const handleSelectPath = useCallback(
		async (target: AppConfigKeys.LOCAL_DIR | AppConfigKeys.LOGS_DIR | AppConfigKeys.GAME_EXEC, directory: boolean, title: string) => {
			try {
				const selectedPath = await selectPath(target, directory, title);
				if (!selectedPath) {
					return;
				}

				void validateFile(target, selectedPath).catch(() => undefined);
			} catch (error) {
				openNotification(
					{
						message: 'Could not open the file picker',
						description: error instanceof Error ? error.message : String(error),
						placement: 'bottomLeft',
						duration: null
					},
					'error'
				);
			}
		},
		[openNotification, selectPath, validateFile]
	);

	const handleSaveChanges = useCallback(async () => {
		const valid = await validateSettingsBeforeSave();
		if (!valid) {
			openNotification(
				{
					message: 'Could not save settings',
					description: 'Fix the highlighted settings first.',
					placement: 'bottomLeft',
					duration: 3
				},
				'error'
			);
			return;
		}

		const result = await saveChanges();
		if (result.ok) {
			openNotification(
				{
					message: 'Settings saved',
					description: result.reloadRequired
						? 'Mod data will refresh using the updated paths and manager settings.'
						: 'Your changes are available now.',
					placement: 'bottomLeft',
					duration: 2
				},
				'success'
			);
			return;
		}

		openNotification(
			{
				message: 'Could not save settings',
				description: result.message,
				placement: 'bottomLeft',
				duration: null
			},
			'error'
		);
	}, [openNotification, saveChanges, validateSettingsBeforeSave]);

	return {
		addLogConfig,
		appState,
		cancelChanges,
		closeModal,
		config,
		configErrors,
		editingConfig,
		editingContext,
		editingContextIndex,
		form,
		handleSaveChanges,
		handleSelectPath,
		isLinux,
		loggingOverridesOpen,
		madeConfigEdits,
		modalType,
		openLogEditModal,
		openWorkshopIdModal,
		removeLogConfig,
		savingConfig,
		selectingDirectory,
		setField,
		setLoggingOverridesOpen,
		updateConfigErrors,
		updateLogConfig,
		validateFile
	};
}

type SettingsViewController = ReturnType<typeof useSettingsViewController>;

function renderSettingsViewContent(controller: SettingsViewController) {
	const {
		addLogConfig,
		cancelChanges,
		closeModal,
		config,
		configErrors,
		editingConfig,
		editingContext,
		editingContextIndex,
		form,
		handleSaveChanges,
		handleSelectPath,
		isLinux,
		loggingOverridesOpen,
		madeConfigEdits,
		modalType,
		openLogEditModal,
		openWorkshopIdModal,
		removeLogConfig,
		savingConfig,
		selectingDirectory,
		setField,
		setLoggingOverridesOpen,
		updateConfigErrors,
		updateLogConfig,
		validateFile
	} = controller;

	return (
		<div className="SettingsView">
			{modalType === SettingsViewModalType.LOG_EDIT && editingContext ? (
				<SettingsDialog
					key="logger-name-modal"
					title="Edit Logger ID"
					open
					onCancel={() => {
						closeModal({ restoreSnapshot: true });
					}}
					footer={
						<>
							<DesktopButton
								key="cancel-settings"
								onClick={() => {
									closeModal({ restoreSnapshot: true });
								}}
							>
								Cancel
							</DesktopButton>
							<DesktopButton
								key="save-settings"
								variant="primary"
								onClick={() => {
									closeModal();
								}}
							>
								Done
							</DesktopButton>
						</>
					}
				>
					<div className="LoggerNameForm flex min-w-0 flex-col gap-3">
						<SettingsField id="logger-id" label="Logger ID" error={configErrors?.[`editingLogConfig.${editingContextIndex}.loggerID`]}>
							<DesktopInput
								id="logger-id"
								value={editingContext.loggerID}
								onChange={(event) => {
									if (editingContextIndex === undefined) {
										return;
									}

									updateLogConfig(editingContextIndex, { loggerID: event.target.value });
								}}
							/>
						</SettingsField>
					</div>
				</SettingsDialog>
			) : null}
			{modalType === SettingsViewModalType.WORKSHOP_ID_EDIT ? (
				<SettingsDialog
					key="workshop-id-modal"
					title="Select Mod Manager Workshop Item"
					open
					onCancel={() => {
						closeModal({ restoreSnapshot: true });
					}}
					footer={
						<>
							<DesktopButton
								variant="primary"
								key="no-changes"
								onClick={() => {
									setField(AppConfigKeys.MANAGER_ID, config.workshopID);
									closeModal();
								}}
							>
								Keep Current Manager
							</DesktopButton>
							<DesktopButton
								key="cancel-edit"
								onClick={() => {
									closeModal({ restoreSnapshot: true });
								}}
							>
								Cancel
							</DesktopButton>
							<DesktopButton
								key="save-settings"
								variant="primary"
								onClick={() => {
									closeModal();
								}}
							>
								Save Manager ID
							</DesktopButton>
						</>
					}
				>
					<div className="WorkshopIDForm flex min-w-0 flex-col gap-3">
						<SettingsField id="workshop-id" label="Workshop item ID" required>
							<DesktopInput
								id="workshop-id"
								inputMode="numeric"
								pattern="[0-9]*"
								value={editingConfig.workshopID.toString()}
								onChange={(event) => {
									setField(AppConfigKeys.MANAGER_ID, parseWorkshopIDInput(event.target.value));
								}}
							/>
						</SettingsField>
					</div>
				</SettingsDialog>
			) : null}
			<main className="box-border min-h-full w-full bg-background text-text">
				<div className="px-6 pt-5">
					<h1 className="m-0 font-display text-[28px] leading-tight text-text">Settings</h1>
					<p className="mb-0 mt-2 max-w-[70ch]">Manage game paths, launch behavior, and logging for this TerraTech install.</p>
				</div>
				<form
					onSubmit={form.handleSubmit(
						() => {
							void handleSaveChanges();
						},
						() => {
							void handleSaveChanges();
						}
					)}
					autoComplete="off"
					className="mb-6 ml-6 mr-6 mt-5 max-[1100px]:mx-5"
				>
					<div className="CollectionSettings mb-2.5 grid grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] gap-x-6 gap-y-5 max-[991px]:grid-cols-1">
						<div key="misc-app-settings" className="flex max-[991px]:mb-5">
							<div className="box-border flex h-full flex-1 flex-col rounded-md border border-border bg-surface px-4.5 py-4">
								<SettingsField
									id="localDir"
									label="Local Mods Folder"
									error={configErrors?.localDir}
									tooltip="Optional. Use this only when you develop or test local mods."
								>
									<DesktopInlineControls>
										<DesktopInput
											id="localDir"
											disabled={selectingDirectory}
											value={editingConfig.localDir ?? ''}
											onBlur={() => {
												void validateFile(AppConfigKeys.LOCAL_DIR, editingConfig.localDir || '').catch(() => undefined);
											}}
											onChange={(event) => {
												setField(AppConfigKeys.LOCAL_DIR, event.target.value);
												if (configErrors?.localDir) {
													updateConfigErrors(AppConfigKeys.LOCAL_DIR);
												}
											}}
										/>
										<DesktopButton
											aria-label="Browse for the Local Mods directory"
											icon={<Folder size={16} />}
											onClick={() => {
												void handleSelectPath(AppConfigKeys.LOCAL_DIR, true, 'Select TerraTech LocalMods directory');
											}}
										/>
									</DesktopInlineControls>
								</SettingsField>
								<SettingsField
									id="gameExec"
									label="TerraTech Executable"
									required={!isLinux}
									error={configErrors?.gameExec}
									extra={isLinux ? 'Unused on Linux. TerraTech is launched through Steam.' : undefined}
								>
									{isLinux ? (
										<DesktopInput id="gameExec" disabled value="Launched through Steam on Linux" />
									) : (
										<DesktopInlineControls>
											<DesktopInput
												id="gameExec"
												disabled={selectingDirectory}
												value={editingConfig.gameExec ?? ''}
												onBlur={() => {
													void validateFile(AppConfigKeys.GAME_EXEC, editingConfig.gameExec).catch(() => undefined);
												}}
												onChange={(event) => {
													setField(AppConfigKeys.GAME_EXEC, event.target.value);
													if (configErrors?.gameExec) {
														updateConfigErrors(AppConfigKeys.GAME_EXEC);
													}
												}}
											/>
											<DesktopButton
												aria-label="Browse for the TerraTech executable"
												icon={<Folder size={16} />}
												onClick={() => {
													void handleSelectPath(AppConfigKeys.GAME_EXEC, false, 'Select TerraTech Executable');
												}}
											/>
										</DesktopInlineControls>
									)}
								</SettingsField>
								<SettingsField
									id="logsDir"
									label="Logs Folder"
									error={configErrors?.logsDir}
									tooltip="Optional. Use this if you want TTSMM-EX to write logs somewhere other than the default app data folder."
								>
									<DesktopInlineControls>
										<DesktopInput
											id="logsDir"
											disabled={selectingDirectory}
											value={editingConfig.logsDir ?? ''}
											onBlur={() => {
												void validateFile(AppConfigKeys.LOGS_DIR, editingConfig.logsDir).catch(() => undefined);
											}}
											onChange={(event) => {
												setField(AppConfigKeys.LOGS_DIR, event.target.value);
												if (configErrors?.logsDir) {
													updateConfigErrors(AppConfigKeys.LOGS_DIR);
												}
											}}
										/>
										<DesktopButton
											aria-label="Browse for the logs directory"
											icon={<Folder size={16} />}
											onClick={() => {
												void handleSelectPath(AppConfigKeys.LOGS_DIR, true, 'Select directory for logs');
											}}
										/>
									</DesktopInlineControls>
								</SettingsField>
								<SettingsField id="closeOnLaunch" label="Close on Game Launch">
									<SettingsSwitch
										id="closeOnLaunch"
										aria-label="Close the app after launching TerraTech"
										checked={editingConfig.closeOnLaunch}
										onChange={(event) => {
											setField('closeOnLaunch', event.target.checked);
										}}
									/>
								</SettingsField>
								<SettingsField
									id="pureVanilla"
									label="Pure Vanilla"
									tooltip="Launch TerraTech without the integrated mod loader when no other mods are enabled."
								>
									<SettingsSwitch
										id="pureVanilla"
										aria-label="Launch TerraTech without the integrated mod loader when no other mods are enabled"
										checked={!!editingConfig.pureVanilla}
										onChange={(event) => {
											setField('pureVanilla', event.target.checked);
										}}
									/>
								</SettingsField>
								<SettingsField
									id="treatNuterraSteamBetaAsEquivalent"
									label="Match NuterraSteam Beta"
									tooltip="Treat NuterraSteam and NuterraSteam Beta as the same dependency target during collection validation."
								>
									<SettingsSwitch
										id="treatNuterraSteamBetaAsEquivalent"
										aria-label="Treat NuterraSteam and NuterraSteam Beta as equivalent"
										checked={editingConfig.treatNuterraSteamBetaAsEquivalent ?? true}
										onChange={(event) => {
											setField('treatNuterraSteamBetaAsEquivalent', event.target.checked);
										}}
									/>
								</SettingsField>
								<SettingsField id="logLevel" label="App Log Level" tooltip="Controls how much this desktop app logs.">
									<SettingsSelect
										id="logLevel"
										aria-label="App logging level"
										value={editingConfig.logLevel || LogLevel.INFO}
										onChange={(event) => {
											setField('logLevel', event.target.value as LogLevel);
										}}
									>
										{APP_LOG_LEVEL_OPTIONS.map((level) => (
											<option key={level} value={level}>
												{formatLogLevelLabel(level)}
											</option>
										))}
									</SettingsSelect>
								</SettingsField>
								<SettingsField
									id="workshopID"
									label="Manager Workshop ID"
									required
									tooltip="The Steam Workshop item ID for the mod manager package this app should launch with."
								>
									<DesktopInlineControls>
										<DesktopInput
											id="workshopID"
											aria-label="Current mod manager workshop item ID"
											value={editingConfig.workshopID.toString()}
											disabled
										/>
										<DesktopButton
											aria-label="Edit the mod manager workshop item ID"
											icon={<Edit3 size={16} />}
											variant="primary"
											onClick={() => {
												openWorkshopIdModal();
											}}
										/>
									</DesktopInlineControls>
								</SettingsField>
							</div>
						</div>
						<div key="additional-commands" className="flex">
							<div className="box-border flex h-full flex-1 flex-col rounded-md border border-border bg-surface px-4.5 py-4">
								<SettingsField id="extraParams" label="Launch Arguments">
									<DesktopInput
										id="extraParams"
										value={editingConfig.extraParams ?? ''}
										onChange={(event) => {
											setField('extraParams', event.target.value);
										}}
									/>
								</SettingsField>
								<details
									className="mt-0.5 border-t border-border pt-1"
									open={loggingOverridesOpen}
									onToggle={(event) => {
										setLoggingOverridesOpen(event.currentTarget.open);
									}}
								>
									<summary className="min-h-9.5 cursor-pointer select-none py-2.25 font-[650] leading-tight text-text marker:text-text-muted focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background">
										Logging Overrides
									</summary>
									<div className="pt-3">
										{editingConfig.editingLogConfig.map((config, index) => {
											const id = `editingLogConfig.${index}.loggerID`;

											return (
												<SettingsField id={id} key={id} label={`Override ${index + 1}`} error={configErrors?.[id]}>
													<div className="flex w-full flex-wrap gap-2">
														<SettingsSelect
															id={`${id}.level`}
															className="flex-[1_1_12rem]"
															aria-label={`Logging level for override ${index + 1}`}
															value={config.level}
															onChange={(event) => {
																updateLogConfig(index, { level: event.target.value as NLogLevel });
															}}
														>
															{NLOG_LEVEL_OPTIONS.map((level) => (
																<option key={level} value={level}>
																	{formatLogLevelLabel(level)}
																</option>
															))}
														</SettingsSelect>
														<DesktopInlineControls className="flex-[2_1_16rem] [&_.DesktopInput]:flex-auto">
															<DesktopInput id={id} value={config.loggerID} disabled />
															<DesktopButton
																aria-label={`Edit logger override ${index + 1}`}
																icon={<Edit3 size={16} />}
																variant="primary"
																onClick={() => {
																	openLogEditModal(index);
																}}
															/>
														</DesktopInlineControls>
														<DesktopButton
															aria-label={`Remove logger override ${index + 1}`}
															icon={<X size={16} />}
															danger
															variant="primary"
															onClick={() => {
																removeLogConfig(index);
															}}
														/>
													</div>
												</SettingsField>
											);
										})}
										<div className="flex justify-start">
											<DesktopButton
												icon={<Plus size={16} />}
												onClick={() => {
													addLogConfig();
												}}
												variant="primary"
											>
												Add Override
											</DesktopButton>
										</div>
									</div>
								</details>
							</div>
						</div>
					</div>
					<div className="flex w-full flex-wrap items-center justify-center gap-3 pt-2.5 max-[1199px]:justify-start max-[1199px]:[&_.DesktopButton]:w-full max-[1199px]:[&_.DesktopButton]:flex-[1_1_100%]">
						<span className="min-h-5 text-sm font-[650] text-[color-mix(in_srgb,var(--app-color-primary)_76%,white)]" aria-live="polite">
							{madeConfigEdits ? 'Unsaved changes' : ''}
						</span>
						<DesktopButton disabled={!madeConfigEdits} type="button" onClick={cancelChanges}>
							Reset Changes
						</DesktopButton>
						<DesktopButton loading={savingConfig} disabled={!madeConfigEdits} variant="primary" type="submit">
							Save Changes
						</DesktopButton>
					</div>
				</form>
			</main>
		</div>
	);
}

function SettingsViewComponent(props: SettingsViewProps) {
	return renderSettingsViewContent(useSettingsViewController(props));
}

export const SettingsView = memo(SettingsViewComponent);

export default function SettingsRoute() {
	return <SettingsView appState={useOutletContext<AppState>()} />;
}

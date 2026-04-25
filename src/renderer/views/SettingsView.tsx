import { memo, useCallback, useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { AppState } from 'model';
import { AppConfigKeys, LogLevel, NLogLevel, SettingsViewModalType } from 'model';
import { useOutletContext } from 'react-router-dom';
import { Edit3, Folder, Plus, X } from 'lucide-react';
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

interface SettingsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	danger?: boolean;
	icon?: ReactNode;
	loading?: boolean;
	variant?: 'default' | 'primary';
}

function SettingsButton({
	children,
	className,
	danger,
	disabled,
	icon,
	loading,
	type = 'button',
	variant = 'default',
	...props
}: SettingsButtonProps) {
	const buttonToneClassName = danger
		? 'border-error bg-error'
		: variant === 'primary'
			? 'border-primary bg-primary'
			: 'border-border bg-surface-elevated enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]';
	const buttonClassName = [
		'SettingsButton box-border inline-flex min-h-control cursor-pointer items-center justify-center gap-2 rounded-md border px-3.5 font-[650] text-text',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-[0.55]',
		buttonToneClassName,
		className
	]
		.filter(Boolean)
		.join(' ');

	return (
		<button {...props} type={type} disabled={disabled || loading} className={buttonClassName}>
			{loading ? (
				<span
					className="size-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
					aria-hidden="true"
				/>
			) : icon ? (
				<span className="inline-flex items-center">{icon}</span>
			) : null}
			{children ? <span className="inline-flex items-center">{children}</span> : null}
		</button>
	);
}

function SettingsInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	const inputClassName = [
		'SettingsInput box-border min-h-control w-full min-w-0 rounded-md border border-border bg-surface-elevated px-[11px] text-text outline-none',
		'focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus:ring-offset-2 focus:ring-offset-background',
		'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted',
		className
	]
		.filter(Boolean)
		.join(' ');

	return <input {...props} className={inputClassName} />;
}

function SettingsDialog({
	children,
	footer,
	onCancel,
	open,
	title
}: {
	children: ReactNode;
	footer?: ReactNode;
	onCancel: () => void;
	open: boolean;
	title: string;
}) {
	const titleId = useId();
	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onCancel();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [onCancel, open]);

	if (!open) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-[1000] flex items-center justify-center bg-[color-mix(in_srgb,var(--app-color-background)_72%,transparent)] p-6"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					onCancel();
				}
			}}
		>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="flex max-h-[min(680px,calc(100vh_-_48px))] w-[min(560px,100%)] flex-col overflow-hidden rounded-md border border-border bg-surface-elevated shadow-[0_16px_36px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)]"
			>
				<div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
					<h2 id={titleId} className="m-0 text-lg leading-[1.3] text-text">
						{title}
					</h2>
					<SettingsButton aria-label="Close dialog" icon={<X size={16} />} onClick={onCancel} />
				</div>
				<div className="overflow-auto p-4">{children}</div>
				{footer ? <div className="flex items-center justify-end gap-2.5 border-t border-border px-4 py-3.5">{footer}</div> : null}
			</section>
		</div>
	);
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
		<div className={`SettingsField${error ? ' has-error' : ''}`}>
			<label className={`SettingsFieldLabel${required ? ' is-required' : ''}`} htmlFor={id} title={tooltip}>
				{label}
			</label>
			<div className="SettingsFieldBody">
				{children}
				{extra ? (
					<div className="SettingsFieldExtra" id={helpId}>
						{extra}
					</div>
				) : null}
				{error ? (
					<div className="SettingsFieldError" id={errorId} role="alert">
						{error}
					</div>
				) : null}
			</div>
		</div>
	);
}

function SettingsViewComponent({ appState }: SettingsViewProps) {
	const { config, configErrors: appConfigErrors, madeConfigEdits, savingConfig, updateState } = appState;
	const isLinux = window.electron.platform === 'linux';
	const { openNotification } = useNotifications();
	const [loggingOverridesOpen, setLoggingOverridesOpen] = useState(false);
	const [configErrors, setConfigErrors] = useState<SettingsConfigErrors>(() => appConfigErrors || {});
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
		setConfigErrors(appConfigErrors || {});
	}, [appConfigErrors]);

	useEffect(() => {
		if (editingConfig.editingLogConfig.length > 0) {
			setLoggingOverridesOpen(true);
		}
	}, [editingConfig.editingLogConfig.length]);

	const commitConfigErrors = useCallback(
		(nextErrors: SettingsConfigErrors) => {
			setConfigErrors(nextErrors);
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
		const localDirError = await getSettingsPathError(AppConfigKeys.LOCAL_DIR, editingConfig.localDir);
		const logsDirError = await getSettingsPathError(AppConfigKeys.LOGS_DIR, editingConfig.logsDir);
		const gameExecError = isLinux ? undefined : await getSettingsPathError(AppConfigKeys.GAME_EXEC, editingConfig.gameExec);
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
							<SettingsButton
								key="cancel-settings"
								onClick={() => {
									closeModal({ restoreSnapshot: true });
								}}
							>
								Cancel
							</SettingsButton>
							<SettingsButton
								key="save-settings"
								variant="primary"
								onClick={() => {
									closeModal();
								}}
							>
								Done
							</SettingsButton>
						</>
					}
				>
					<div className="LoggerNameForm SettingsNativeForm">
						<SettingsField id="logger-id" label="Logger ID" error={configErrors?.[`editingLogConfig.${editingContextIndex}.loggerID`]}>
							<SettingsInput
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
							<SettingsButton
								variant="primary"
								key="no-changes"
								onClick={() => {
									setField(AppConfigKeys.MANAGER_ID, config.workshopID);
									closeModal();
								}}
							>
								Keep Current Manager
							</SettingsButton>
							<SettingsButton
								key="cancel-edit"
								onClick={() => {
									closeModal({ restoreSnapshot: true });
								}}
							>
								Cancel
							</SettingsButton>
							<SettingsButton
								key="save-settings"
								variant="primary"
								onClick={() => {
									closeModal();
								}}
							>
								Save Manager ID
							</SettingsButton>
						</>
					}
				>
					<div className="WorkshopIDForm SettingsNativeForm">
						<SettingsField id="workshop-id" label="Workshop item ID" required>
							<SettingsInput
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
			<main className="Settings">
				<div className="SettingsHeader">
					<h1 className="SettingsTitle">Settings</h1>
					<p className="SettingsIntro">Manage game paths, launch behavior, and logging for this TerraTech install.</p>
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
					className="SettingsForm"
				>
					<div className="CollectionSettings SettingsPaneGrid">
						<div key="misc-app-settings" className="SettingsPaneColumn MiscAppSettings">
							<div className="SettingsPane">
								<SettingsField
									id="localDir"
									label="Local Mods Folder"
									error={configErrors?.localDir}
									tooltip="Optional. Use this only when you develop or test local mods."
								>
									<div className="SettingsPathControl">
										<SettingsInput
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
										<SettingsButton
											aria-label="Browse for the Local Mods directory"
											icon={<Folder size={16} />}
											onClick={() => {
												void handleSelectPath(AppConfigKeys.LOCAL_DIR, true, 'Select TerraTech LocalMods directory');
											}}
										/>
									</div>
								</SettingsField>
								<SettingsField
									id="gameExec"
									label="TerraTech Executable"
									required={!isLinux}
									error={configErrors?.gameExec}
									extra={isLinux ? 'Unused on Linux. TerraTech is launched through Steam.' : undefined}
								>
									{isLinux ? (
										<SettingsInput id="gameExec" disabled value="Launched through Steam on Linux" />
									) : (
										<div className="SettingsPathControl">
											<SettingsInput
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
											<SettingsButton
												aria-label="Browse for the TerraTech executable"
												icon={<Folder size={16} />}
												onClick={() => {
													void handleSelectPath(AppConfigKeys.GAME_EXEC, false, 'Select TerraTech Executable');
												}}
											/>
										</div>
									)}
								</SettingsField>
								<SettingsField
									id="logsDir"
									label="Logs Folder"
									error={configErrors?.logsDir}
									tooltip="Optional. Use this if you want TTSMM-EX to write logs somewhere other than the default app data folder."
								>
									<div className="SettingsPathControl">
										<SettingsInput
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
										<SettingsButton
											aria-label="Browse for the logs directory"
											icon={<Folder size={16} />}
											onClick={() => {
												void handleSelectPath(AppConfigKeys.LOGS_DIR, true, 'Select directory for logs');
											}}
										/>
									</div>
								</SettingsField>
								<SettingsField id="closeOnLaunch" label="Close on Game Launch">
									<input
										id="closeOnLaunch"
										type="checkbox"
										className="SettingsSwitch"
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
									<input
										id="pureVanilla"
										type="checkbox"
										className="SettingsSwitch"
										aria-label="Launch TerraTech without the integrated mod loader when no other mods are enabled"
										checked={!!editingConfig.pureVanilla}
										onChange={(event) => {
											setField('pureVanilla', event.target.checked);
										}}
									/>
								</SettingsField>
								<SettingsField id="logLevel" label="App Log Level" tooltip="Controls how much this desktop app logs.">
									<select
										id="logLevel"
										className="SettingsSelect"
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
									</select>
								</SettingsField>
								<SettingsField
									id="workshopID"
									label="Manager Workshop ID"
									required
									tooltip="The Steam Workshop item ID for the mod manager package this app should launch with."
								>
									<div className="SettingsInlineControls">
										<SettingsInput
											id="workshopID"
											aria-label="Current mod manager workshop item ID"
											value={editingConfig.workshopID.toString()}
											disabled
										/>
										<SettingsButton
											aria-label="Edit the mod manager workshop item ID"
											icon={<Edit3 size={16} />}
											variant="primary"
											onClick={() => {
												openWorkshopIdModal();
											}}
										/>
									</div>
								</SettingsField>
							</div>
						</div>
						<div key="additional-commands" className="SettingsPaneColumn">
							<div className="SettingsPane">
								<SettingsField id="extraParams" label="Launch Arguments">
									<SettingsInput
										id="extraParams"
										value={editingConfig.extraParams ?? ''}
										onChange={(event) => {
											setField('extraParams', event.target.value);
										}}
									/>
								</SettingsField>
								<details
									className="SettingsDisclosure"
									open={loggingOverridesOpen}
									onToggle={(event) => {
										setLoggingOverridesOpen(event.currentTarget.open);
									}}
								>
									<summary className="SettingsDisclosureSummary">Logging Overrides</summary>
									<div className="SettingsDisclosureBody">
										{editingConfig.editingLogConfig.map((config, index) => {
											const id = `editingLogConfig.${index}.loggerID`;

											return (
												<SettingsField
													id={id}
													key={`${config.loggerID}-${index}`}
													label={`Override ${index + 1}`}
													error={configErrors?.[id]}
												>
													<div className="SettingsLoggerConfigRow">
														<select
															id={`${id}.level`}
															className="SettingsSelect SettingsLoggerLevelSelect"
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
														</select>
														<div className="SettingsInlineControls SettingsLoggerIdControl">
															<SettingsInput id={id} className="SettingsLoggerIdInput" value={config.loggerID} disabled />
															<SettingsButton
																aria-label={`Edit logger override ${index + 1}`}
																icon={<Edit3 size={16} />}
																variant="primary"
																onClick={() => {
																	openLogEditModal(index);
																}}
															/>
														</div>
														<SettingsButton
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
										<div className="SettingsDisclosureActions">
											<SettingsButton
												icon={<Plus size={16} />}
												onClick={() => {
													addLogConfig();
												}}
												variant="primary"
											>
												Add Override
											</SettingsButton>
										</div>
									</div>
								</details>
							</div>
						</div>
					</div>
					<div className="SettingsActions">
						<SettingsButton disabled={!madeConfigEdits} type="button" onClick={cancelChanges}>
							Reset Changes
						</SettingsButton>
						<SettingsButton loading={savingConfig} disabled={!madeConfigEdits} variant="primary" type="submit">
							Save Changes
						</SettingsButton>
					</div>
				</form>
			</main>
		</div>
	);
}

export const SettingsView = memo(SettingsViewComponent);

export default function SettingsRoute() {
	return <SettingsView appState={useOutletContext<AppState>()} />;
}

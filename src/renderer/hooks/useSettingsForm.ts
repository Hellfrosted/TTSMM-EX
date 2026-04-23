import { useCallback, useEffect, useState } from 'react';
import { AppConfig, AppConfigKeys, AppState, NLogLevel, SettingsViewModalType } from 'model';
import api from 'renderer/Api';
import { writeConfig } from 'renderer/util/config-write';

export interface LogConfig {
	level: NLogLevel;
	loggerID: string;
}

export interface EditingConfig extends AppConfig {
	editingLogConfig: LogConfig[];
}

function cloneEditingConfig(config: EditingConfig): EditingConfig {
	return {
		...config,
		editingLogConfig: config.editingLogConfig.map((logConfig) => ({
			...logConfig
		}))
	};
}

export type SaveSettingsResult =
	| {
			ok: true;
			reloadRequired: boolean;
	  }
	| {
			ok: false;
			message: string;
	  };

export function createEditingConfig(config: AppConfig): EditingConfig {
	const editingLogConfig = Object.entries(config.logParams || {}).map(([loggerID, level]) => ({
		loggerID,
		level
	}));

	return {
		...config,
		editingLogConfig
	};
}

function createLogParams(editingLogConfig: LogConfig[]) {
	if (editingLogConfig.length === 0) {
		return undefined;
	}

	return editingLogConfig.reduce<{ [loggerID: string]: NLogLevel }>((nextLogParams, logConfig) => {
		nextLogParams[logConfig.loggerID] = logConfig.level;
		return nextLogParams;
	}, {});
}

export function useSettingsForm(appState: AppState) {
	const [editingConfig, setEditingConfig] = useState<EditingConfig>(() => createEditingConfig(appState.config));
	const [selectingDirectory, setSelectingDirectory] = useState(false);
	const [modalType, setModalType] = useState(SettingsViewModalType.NONE);
	const [editingContextIndex, setEditingContextIndex] = useState<number>();
	const [modalSnapshot, setModalSnapshot] = useState<EditingConfig>();

	useEffect(() => {
		setEditingConfig(createEditingConfig(appState.config));
		setSelectingDirectory(false);
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
		setModalSnapshot(undefined);
	}, [appState.config]);

	const markConfigEdited = useCallback(() => {
		appState.updateState({ madeConfigEdits: true });
	}, [appState]);

	const setField = useCallback(
		<K extends keyof EditingConfig>(field: K, value: EditingConfig[K]) => {
			setEditingConfig((currentConfig) => ({
				...currentConfig,
				[field]: value
			}));
			markConfigEdited();
		},
		[markConfigEdited]
	);

	const updateLogConfig = useCallback(
		(index: number, updates: Partial<LogConfig>) => {
			setEditingConfig((currentConfig) => ({
				...currentConfig,
				editingLogConfig: currentConfig.editingLogConfig.map((logConfig, currentIndex) => {
					if (currentIndex !== index) {
						return logConfig;
					}

					return {
						...logConfig,
						...updates
					};
				})
			}));
			markConfigEdited();
		},
		[markConfigEdited]
	);

	const addLogConfig = useCallback(() => {
		setEditingConfig((currentConfig) => ({
			...currentConfig,
			editingLogConfig: [...currentConfig.editingLogConfig, { loggerID: '', level: NLogLevel.ERROR }]
		}));
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
		markConfigEdited();
	}, [markConfigEdited]);

	const removeLogConfig = useCallback(
		(index: number) => {
			setEditingConfig((currentConfig) => ({
				...currentConfig,
				editingLogConfig: currentConfig.editingLogConfig.filter((_, currentIndex) => currentIndex !== index)
			}));
			setModalType(SettingsViewModalType.NONE);
			setEditingContextIndex(undefined);
			markConfigEdited();
		},
		[markConfigEdited]
	);

	const selectPath = useCallback(
		async (target: AppConfigKeys.LOCAL_DIR | AppConfigKeys.LOGS_DIR | AppConfigKeys.GAME_EXEC, directory: boolean, title: string) => {
			if (selectingDirectory) {
				return null;
			}

			setSelectingDirectory(true);
			try {
				const selectedPath = await api.selectPath(directory, title);
				if (selectedPath) {
					setEditingConfig((currentConfig) => ({
						...currentConfig,
						[target]: selectedPath
					}));
					markConfigEdited();
				}
				return selectedPath;
			} catch (error) {
				api.logger.error(error);
				throw error instanceof Error ? error : new Error('Failed to browse for a path');
			} finally {
				setSelectingDirectory(false);
			}
		},
		[markConfigEdited, selectingDirectory]
	);

	const saveChanges = useCallback(async (): Promise<SaveSettingsResult> => {
		const { editingLogConfig, logParams: _unusedLogParams, ...nextConfig } = editingConfig;
		const configToSave: AppConfig = {
			...nextConfig
		};
		const nextLogParams = createLogParams(editingLogConfig);
		if (nextLogParams) {
			configToSave.logParams = nextLogParams;
		}

		const shouldReloadMods = appState.config.localDir !== configToSave.localDir || appState.config.workshopID !== configToSave.workshopID;
		const nextLogLevel = configToSave.logLevel;
		const shouldUpdateLogLevel = appState.config.logLevel !== nextLogLevel && nextLogLevel !== undefined;

		appState.updateState({ savingConfig: true });
		try {
			await writeConfig(configToSave);
			if (shouldUpdateLogLevel && nextLogLevel !== undefined) {
				api.updateLogLevel(nextLogLevel);
			}
			const nextState: {
				config: AppConfig;
				madeConfigEdits: boolean;
				configErrors: {};
				firstModLoad?: boolean;
			} = {
				config: { ...configToSave },
				madeConfigEdits: false,
				configErrors: {}
			};
			if (shouldReloadMods) {
				nextState.firstModLoad = false;
			}
			appState.updateState({
				...nextState
			});
			return {
				ok: true,
				reloadRequired: shouldReloadMods
			};
		} catch (error) {
			api.logger.error(error);
			return {
				ok: false,
				message: error instanceof Error ? error.message : 'Failed to save settings'
			};
		} finally {
			appState.updateState({ savingConfig: false });
		}
	}, [appState, editingConfig]);

	const cancelChanges = useCallback(() => {
		setEditingConfig(createEditingConfig(appState.config));
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
		setModalSnapshot(undefined);
		appState.updateState({ madeConfigEdits: false });
	}, [appState]);

	const closeModal = useCallback((options?: { restoreSnapshot?: boolean }) => {
		if (options?.restoreSnapshot && modalSnapshot) {
			setEditingConfig(cloneEditingConfig(modalSnapshot));
		}
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
		setModalSnapshot(undefined);
	}, [modalSnapshot]);

	return {
		editingConfig,
		selectingDirectory,
		modalType,
		editingContextIndex,
		editingContext: editingContextIndex !== undefined ? editingConfig.editingLogConfig[editingContextIndex] : undefined,
		setField,
		updateLogConfig,
		addLogConfig,
		removeLogConfig,
		selectPath,
		saveChanges,
		cancelChanges,
		openLogEditModal: (index: number) => {
			setModalSnapshot(cloneEditingConfig(editingConfig));
			setModalType(SettingsViewModalType.LOG_EDIT);
			setEditingContextIndex(index);
		},
		openWorkshopIdModal: () => {
			setModalSnapshot(cloneEditingConfig(editingConfig));
			setModalType(SettingsViewModalType.WORKSHOP_ID_EDIT);
			setEditingContextIndex(undefined);
		},
		closeModal
	};
}

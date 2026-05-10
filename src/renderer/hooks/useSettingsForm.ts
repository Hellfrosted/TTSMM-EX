import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, useFormState, useWatch } from 'react-hook-form';
import type { Path, PathValue } from 'react-hook-form';
import type { AppState } from 'model';
import { AppConfig, AppConfigKeys, NLogLevel, SettingsViewModalType } from 'model';
import api from 'renderer/Api';
import { useWriteConfigMutation } from 'renderer/async-cache';
import { settingsFormSchema, type EditingConfig, type LogConfig } from 'renderer/settings-validation';

function cloneEditingConfig(config: EditingConfig): EditingConfig {
	return {
		...config,
		editingLogConfig: config.editingLogConfig.map((logConfig) => ({
			...logConfig
		}))
	};
}

type SaveSettingsResult =
	| {
			ok: true;
			reloadRequired: boolean;
	  }
	| {
			ok: false;
			message: string;
	  };

type SettingsPathTarget = AppConfigKeys.LOCAL_DIR | AppConfigKeys.LOGS_DIR | AppConfigKeys.GAME_EXEC;

function createEditingConfig(config: AppConfig): EditingConfig {
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
		nextLogParams[logConfig.loggerID.trim()] = logConfig.level;
		return nextLogParams;
	}, {});
}

export function useSettingsForm(appState: Pick<AppState, 'config' | 'updateState'>) {
	const { config, updateState } = appState;
	const writeConfigMutation = useWriteConfigMutation();
	const form = useForm<EditingConfig>({
		defaultValues: createEditingConfig(config),
		mode: 'onSubmit',
		resolver: zodResolver(settingsFormSchema)
	});
	const watchedEditingConfig = useWatch({ control: form.control });
	const { isDirty } = useFormState({ control: form.control });
	const editingConfig = useMemo(
		() =>
			({
				...createEditingConfig(config),
				...watchedEditingConfig,
				editingLogConfig: watchedEditingConfig.editingLogConfig ?? []
			}) as EditingConfig,
		[config, watchedEditingConfig]
	);
	const [selectingDirectory, setSelectingDirectory] = useState(false);
	const [selectingPathTarget, setSelectingPathTarget] = useState<SettingsPathTarget>();
	const [modalType, setModalType] = useState(SettingsViewModalType.NONE);
	const [editingContextIndex, setEditingContextIndex] = useState<number>();
	const [modalSnapshot, setModalSnapshot] = useState<EditingConfig>();

	useEffect(() => {
		form.reset(createEditingConfig(config));
		setSelectingDirectory(false);
		setSelectingPathTarget(undefined);
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
		setModalSnapshot(undefined);
	}, [config, form]);

	useEffect(() => {
		updateState({ madeConfigEdits: isDirty });
	}, [isDirty, updateState]);

	const setField = useCallback(
		<K extends keyof EditingConfig>(field: K, value: EditingConfig[K]) => {
			const formField = field as Path<EditingConfig>;
			form.setValue(formField, value as PathValue<EditingConfig, typeof formField>, { shouldDirty: true, shouldValidate: false });
		},
		[form]
	);

	const updateLogConfig = useCallback(
		(index: number, updates: Partial<LogConfig>) => {
			const currentEditingConfig = form.getValues();
			form.setValue(
				'editingLogConfig',
				currentEditingConfig.editingLogConfig.map((logConfig, currentIndex) => {
					if (currentIndex !== index) {
						return logConfig;
					}

					return {
						...logConfig,
						...updates
					};
				}),
				{ shouldDirty: true, shouldValidate: false }
			);
		},
		[form]
	);

	const addLogConfig = useCallback(() => {
		const currentEditingConfig = form.getValues();
		form.setValue('editingLogConfig', [...currentEditingConfig.editingLogConfig, { loggerID: '', level: NLogLevel.ERROR }], {
			shouldDirty: true,
			shouldValidate: false
		});
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
	}, [form]);

	const removeLogConfig = useCallback(
		(index: number) => {
			const currentEditingConfig = form.getValues();
			form.setValue(
				'editingLogConfig',
				currentEditingConfig.editingLogConfig.filter((_, currentIndex) => currentIndex !== index),
				{ shouldDirty: true, shouldValidate: false }
			);
			setModalType(SettingsViewModalType.NONE);
			setEditingContextIndex(undefined);
		},
		[form]
	);

	const selectPath = useCallback(
		async (target: SettingsPathTarget, directory: boolean, title: string) => {
			if (selectingDirectory) {
				return null;
			}

			setSelectingDirectory(true);
			setSelectingPathTarget(target);
			try {
				const selectedPath = await api.selectPath(directory, title);
				if (selectedPath) {
					form.setValue(target, selectedPath, { shouldDirty: true, shouldValidate: false });
				}
				return selectedPath;
			} catch (error) {
				api.logger.error(error);
				throw error instanceof Error ? error : new Error('Failed to browse for a path');
			} finally {
				setSelectingDirectory(false);
				setSelectingPathTarget(undefined);
			}
		},
		[form, selectingDirectory]
	);

	const saveChanges = useCallback(async (): Promise<SaveSettingsResult> => {
		const valid = await form.trigger();
		if (!valid) {
			return {
				ok: false,
				message: 'Fix highlighted settings first'
			};
		}

		const editingConfig = form.getValues();
		const { editingLogConfig, ...nextConfig } = editingConfig;
		const configToSave: AppConfig = {
			...nextConfig
		};
		delete configToSave.logParams;
		const nextLogParams = createLogParams(editingLogConfig);
		if (nextLogParams) {
			configToSave.logParams = nextLogParams;
		}

		const shouldReloadMods =
			config.localDir !== configToSave.localDir ||
			config.workshopID !== configToSave.workshopID ||
			config.treatNuterraSteamBetaAsEquivalent !== configToSave.treatNuterraSteamBetaAsEquivalent;
		const nextLogLevel = configToSave.logLevel;
		const shouldUpdateLogLevel = config.logLevel !== nextLogLevel && nextLogLevel !== undefined;

		updateState({ savingConfig: true });
		try {
			const persistedConfig = await writeConfigMutation.mutateAsync(configToSave);
			if (shouldUpdateLogLevel && persistedConfig.logLevel !== undefined) {
				api.updateLogLevel(persistedConfig.logLevel);
			}
			const nextState: {
				config: AppConfig;
				madeConfigEdits: boolean;
				configErrors: {};
				firstModLoad?: boolean;
			} = {
				config: persistedConfig,
				madeConfigEdits: false,
				configErrors: {}
			};
			if (shouldReloadMods) {
				nextState.firstModLoad = false;
			}
			updateState({
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
			updateState({ savingConfig: false });
		}
	}, [
		config.localDir,
		config.logLevel,
		config.treatNuterraSteamBetaAsEquivalent,
		config.workshopID,
		form,
		updateState,
		writeConfigMutation
	]);

	const cancelChanges = useCallback(() => {
		form.reset(createEditingConfig(config));
		setModalType(SettingsViewModalType.NONE);
		setEditingContextIndex(undefined);
		setModalSnapshot(undefined);
		updateState({ madeConfigEdits: false, configErrors: {} });
	}, [config, form, updateState]);

	const closeModal = useCallback(
		(options?: { restoreSnapshot?: boolean }) => {
			if (options?.restoreSnapshot && modalSnapshot) {
				form.reset(cloneEditingConfig(modalSnapshot), { keepDefaultValues: true });
			}
			setModalType(SettingsViewModalType.NONE);
			setEditingContextIndex(undefined);
			setModalSnapshot(undefined);
		},
		[form, modalSnapshot]
	);

	return {
		form,
		editingConfig,
		selectingDirectory,
		selectingPathTarget,
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

import type { IpcMain } from 'electron';
import { app } from 'electron';
import log from 'electron-log';

import { AppConfig, LogLevel, ValidChannel } from '../../model';
import { mergeConfigChanges } from '../config-merge';
import { applyLogLevel, configFilePath, readConfigFileEffect, writeConfigFileEffect } from '../config-store';
import { runConfigTransaction } from '../config-transaction';
import { runMain } from '../runtime';
import { parseAppConfigPayload } from './config-validation';
import { registerValidatedIpcHandler, registerValidatedIpcListener } from './ipc-handler';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerConfigHandlers(
	ipcMain: IpcMain,
	isDevelopment: boolean,
	userDataPathProvider: UserDataPathProvider = {
		getUserDataPath: () => app.getPath('userData')
	}
) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	registerValidatedIpcListener(ipcMain, ValidChannel.UPDATE_LOG_LEVEL, (_event, level: LogLevel) => {
		applyLogLevel(level, isDevelopment);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.USER_DATA_PATH, async () => {
		return getUserDataPath();
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.READ_CONFIG, () => {
		const userDataPath = getUserDataPath();
		return runConfigTransaction(userDataPath, () => runMain(readConfigFileEffect(configFilePath(userDataPath), isDevelopment)));
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.UPDATE_CONFIG, (_event, config: AppConfig, baseConfig?: AppConfig) => {
		log.debug('updated config');
		const userDataPath = getUserDataPath();
		const parsed = parseAppConfigPayload(ValidChannel.UPDATE_CONFIG, config);
		const base = baseConfig === undefined ? undefined : parseAppConfigPayload(ValidChannel.UPDATE_CONFIG, baseConfig);
		return runConfigTransaction(userDataPath, async () => {
			const filepath = configFilePath(userDataPath);
			const current = await runMain(readConfigFileEffect(filepath, isDevelopment));
			if (current && !base) return null;
			// Collection lifecycle operations own the active selection after initialization.
			const merged = current && base ? mergeConfigChanges(current, base, parsed) : parsed;
			const next = current ? { ...merged, activeCollection: current.activeCollection } : merged;
			return runMain(writeConfigFileEffect(filepath, next));
		});
	});
}

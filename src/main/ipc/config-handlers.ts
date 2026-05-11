import type { IpcMain } from 'electron';
import { app } from 'electron';
import log from 'electron-log';
import path from 'path';

import { AppConfig, LogLevel, ValidChannel } from '../../model';
import { applyLogLevel, readConfigFile, writeConfigFile } from '../config-store';
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

	registerValidatedIpcHandler(ipcMain, ValidChannel.READ_CONFIG, async () => {
		return readConfigFile(path.join(getUserDataPath(), 'config.json'), isDevelopment);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.UPDATE_CONFIG, async (_event, config: AppConfig) => {
		log.debug('updated config');
		return writeConfigFile(path.join(getUserDataPath(), 'config.json'), parseAppConfigPayload(ValidChannel.UPDATE_CONFIG, config));
	});
}

import fs from 'fs';
import path from 'path';
import { app, IpcMain } from 'electron';
import log from 'electron-log';

import { AppConfig, LogLevel, ModDataOverride, ModErrorType, ValidChannel } from '../../model';
import { writeUtf8FileAtomic } from '../storage';

export function applyLogLevel(level: log.LogLevel, isDevelopment: boolean) {
	log.transports.file.level = level;
	if (isDevelopment) {
		log.transports.console.level = level;
	}
}

export function readConfigFile(filepath: string, isDevelopment: boolean): AppConfig | null {
	if (!fs.existsSync(filepath)) {
		return null;
	}

	try {
		const appConfig = JSON.parse(fs.readFileSync(filepath, 'utf8').toString());
		if (appConfig.logLevel) {
			applyLogLevel(appConfig.logLevel, isDevelopment);
		}
		if (!appConfig.viewConfigs) {
			appConfig.viewConfigs = {};
		}
		delete (appConfig as { treatNuterraSteamBetaAsEquivalent?: unknown }).treatNuterraSteamBetaAsEquivalent;
		if (appConfig.ignoredValidationErrors) {
			const convertedMap: Map<ModErrorType, { [uid: string]: string[] }> = new Map();
			const castObject = appConfig.ignoredValidationErrors as { [modID: number]: { [uid: string]: string[] } };
			Object.entries(castObject).forEach(([key, value]: [string, { [uid: string]: string[] }]) => {
				convertedMap.set(parseInt(key, 10) as ModErrorType, value);
			});
			appConfig.ignoredValidationErrors = convertedMap;
		} else {
			appConfig.ignoredValidationErrors = new Map();
		}
		if (appConfig.userOverrides) {
			const convertedMap: Map<string, ModDataOverride> = new Map();
			const castObject = appConfig.userOverrides as { [uid: string]: ModDataOverride };
			Object.entries(castObject).forEach(([key, value]: [string, ModDataOverride]) => {
				convertedMap.set(key, value);
			});
			appConfig.userOverrides = convertedMap;
		} else {
			appConfig.userOverrides = new Map();
		}
		if (appConfig.workshopID) {
			appConfig.workshopID = BigInt(appConfig.workshopID);
		}
		return appConfig as AppConfig;
	} catch (error) {
		log.error(`Failed to read config file at ${filepath}`);
		log.error(error);
		throw new Error(`Failed to load config file "${filepath}"`);
	}
}

export function writeConfigFile(filepath: string, config: AppConfig): boolean {
	try {
		const serializedConfig: Record<string, unknown> = { ...config };
		delete (serializedConfig as { treatNuterraSteamBetaAsEquivalent?: unknown }).treatNuterraSteamBetaAsEquivalent;
		if (serializedConfig.ignoredValidationErrors) {
			serializedConfig.ignoredValidationErrors = Object.fromEntries(config.ignoredValidationErrors);
		}
		if (serializedConfig.userOverrides) {
			serializedConfig.userOverrides = Object.fromEntries(config.userOverrides);
		}
		if (config.workshopID) {
			serializedConfig.workshopID = config.workshopID.toString();
		}
		writeUtf8FileAtomic(filepath, JSON.stringify(serializedConfig, null, 4));
		return true;
	} catch (error) {
		log.error(error);
		return false;
	}
}

export function registerConfigHandlers(ipcMain: IpcMain, isDevelopment: boolean) {
	ipcMain.on(ValidChannel.UPDATE_LOG_LEVEL, (_event, level: LogLevel) => {
		applyLogLevel(level, isDevelopment);
	});

	ipcMain.handle(ValidChannel.USER_DATA_PATH, async () => {
		return app.getPath('userData');
	});

	ipcMain.handle(ValidChannel.READ_CONFIG, async () => {
		return readConfigFile(path.join(app.getPath('userData'), 'config.json'), isDevelopment);
	});

	ipcMain.handle(ValidChannel.UPDATE_CONFIG, async (_event, config: AppConfig) => {
		log.debug('updated config');
		return writeConfigFile(path.join(app.getPath('userData'), 'config.json'), config);
	});
}

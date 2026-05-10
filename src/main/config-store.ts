import fs from 'fs';
import log from 'electron-log';

import type { AppConfig } from '../model';
import { normalizeAppConfig } from '../shared/app-config-defaults';
import { writeUtf8FileAtomic } from './storage';

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
		const appConfig = normalizeAppConfig(JSON.parse(fs.readFileSync(filepath, 'utf8').toString()), process.platform);
		if (appConfig.logLevel) {
			applyLogLevel(appConfig.logLevel, isDevelopment);
		}
		return appConfig as AppConfig;
	} catch (error) {
		log.error(`Failed to read config file at ${filepath}`);
		log.error(error);
		throw new Error(`Failed to load config file "${filepath}"`);
	}
}

export function writeConfigFile(filepath: string, config: AppConfig): AppConfig | null {
	try {
		const normalizedConfig = normalizeAppConfig(config, process.platform);
		const serializedConfig: Record<string, unknown> = { ...normalizedConfig };
		if (serializedConfig.ignoredValidationErrors) {
			serializedConfig.ignoredValidationErrors = Object.fromEntries(normalizedConfig.ignoredValidationErrors);
		}
		if (serializedConfig.userOverrides) {
			serializedConfig.userOverrides = Object.fromEntries(normalizedConfig.userOverrides);
		}
		if (typeof normalizedConfig.workshopID === 'bigint') {
			serializedConfig.workshopID = normalizedConfig.workshopID.toString();
		}
		writeUtf8FileAtomic(filepath, JSON.stringify(serializedConfig, null, 4));
		return normalizedConfig;
	} catch (error) {
		log.error(error);
		return null;
	}
}

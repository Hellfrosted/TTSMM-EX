import { Effect } from 'effect';
import log from 'electron-log';

import type { AppConfig } from '../model';
import { normalizeAppConfig } from '../shared/app-config-defaults';
import { fileExistsEffect, readJsonFileEffect, writeUtf8FileAtomicEffect } from './storage';

export function applyLogLevel(level: log.LogLevel, isDevelopment: boolean) {
	log.transports.file.level = level;
	if (isDevelopment) {
		log.transports.console.level = level;
	}
}

export const readConfigFileEffect = Effect.fnUntraced(function* (
	filepath: string,
	isDevelopment: boolean
): Effect.fn.Return<AppConfig | null, Error> {
	const configExists = yield* fileExistsEffect(filepath);
	if (!configExists) {
		return null;
	}

	return yield* readJsonFileEffect<unknown>(filepath).pipe(
		Effect.map((payload) => {
			const appConfig = normalizeAppConfig(payload as Record<string, unknown>, process.platform);
			if (appConfig.logLevel) {
				applyLogLevel(appConfig.logLevel, isDevelopment);
			}
			return appConfig as AppConfig;
		}),
		Effect.mapError((error) => {
			log.error(`Failed to read config file at ${filepath}`);
			log.error(error.cause);
			return new Error(`Failed to load config file "${filepath}"`);
		})
	);
});

export function readConfigFile(filepath: string, isDevelopment: boolean): AppConfig | null {
	return Effect.runSync(readConfigFileEffect(filepath, isDevelopment));
}

function serializeConfig(config: AppConfig): AppConfig {
	return normalizeAppConfig(config, process.platform) as AppConfig;
}

function createSerializedConfigPayload(normalizedConfig: AppConfig): Record<string, unknown> {
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
	return serializedConfig;
}

export const writeConfigFileEffect = Effect.fnUntraced(function* (
	filepath: string,
	config: AppConfig
): Effect.fn.Return<AppConfig | null, Error> {
	const normalizedConfig = serializeConfig(config);
	return yield* writeUtf8FileAtomicEffect(filepath, JSON.stringify(createSerializedConfigPayload(normalizedConfig), null, 4)).pipe(
		Effect.as(normalizedConfig),
		Effect.catch((error) => {
			log.error(error.cause);
			return Effect.succeed(null);
		})
	);
});

export function writeConfigFile(filepath: string, config: AppConfig): AppConfig | null {
	return Effect.runSync(writeConfigFileEffect(filepath, config));
}

import { NLogLevel, type AppConfig } from 'model/AppConfig';
import { ModErrorType } from 'model/CollectionValidation';
import type { ModDataOverride } from 'model/Mod';
import { DEFAULT_COLLECTIONS_PATH, getStoredViewPath } from 'shared/app-route-policy';
import { normalizeBlockLookupViewConfig } from 'shared/block-lookup-view-config';
import { LogLevel } from 'shared/ipc';
import { normalizeMainCollectionConfig } from 'shared/main-collection-view-config';

export const DEFAULT_WORKSHOP_ID = BigInt(2790161231);

function getDefaultExecutablePath(platform: string): string {
	switch (platform) {
		case 'win32':
			return `C:\\Program Files (x86)\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe`;
		case 'darwin':
			return `~/Library/Application Support/Steam/steamapps/common/TerraTech/TerraTechOSX64.app`;
		default:
			return '';
	}
}

function toWorkshopId(value: unknown, fallback: bigint): bigint {
	let parsed: bigint | undefined;
	if (typeof value === 'bigint') {
		parsed = value;
	} else if (typeof value === 'number' && Number.isInteger(value)) {
		parsed = BigInt(value);
	} else if (typeof value === 'string' && /^\d+$/.test(value)) {
		parsed = BigInt(value);
	}

	return parsed !== undefined && parsed > 0n ? parsed : fallback;
}

function normalizeIgnoredValidationErrors(value: unknown): AppConfig['ignoredValidationErrors'] {
	if (value instanceof Map) {
		return new Map(value) as AppConfig['ignoredValidationErrors'];
	}
	if (!value || typeof value !== 'object') {
		return new Map();
	}

	const convertedMap: AppConfig['ignoredValidationErrors'] = new Map();
	Object.entries(value as Record<string, unknown>).forEach(([key, ignoredErrors]) => {
		const errorType = Number(key);
		if (!Number.isInteger(errorType) || !Object.values(ModErrorType).includes(errorType)) {
			return;
		}
		if (!ignoredErrors || typeof ignoredErrors !== 'object' || Array.isArray(ignoredErrors)) {
			return;
		}
		const ignoredByUid = Object.fromEntries(
			Object.entries(ignoredErrors as Record<string, unknown>).flatMap(([uid, ignoredIds]) => {
				if (!Array.isArray(ignoredIds)) {
					return [];
				}
				const normalizedIds = ignoredIds.filter((ignoredId): ignoredId is string => typeof ignoredId === 'string');
				return normalizedIds.length > 0 ? [[uid, normalizedIds]] : [];
			})
		);
		if (Object.keys(ignoredByUid).length > 0) {
			convertedMap.set(errorType as ModErrorType, ignoredByUid);
		}
	});
	return convertedMap;
}

function normalizeUserOverrides(value: unknown): AppConfig['userOverrides'] {
	if (value instanceof Map) {
		return new Map(value) as AppConfig['userOverrides'];
	}
	if (!value || typeof value !== 'object') {
		return new Map();
	}

	const overrides = Object.entries(value as Record<string, unknown>).flatMap(([uid, override]) => {
		if (!override || typeof override !== 'object' || Array.isArray(override)) {
			return [];
		}
		const overrideRecord = override as Record<string, unknown>;
		const normalizedOverride: ModDataOverride = {
			...(typeof overrideRecord.id === 'string' ? { id: overrideRecord.id } : {}),
			...(Array.isArray(overrideRecord.tags) ? { tags: overrideRecord.tags.filter((tag): tag is string => typeof tag === 'string') } : {})
		};
		return Object.keys(normalizedOverride).length > 0 ? ([[uid, normalizedOverride] as const] as const) : [];
	});
	return new Map(overrides);
}

function normalizeLogParams(value: unknown): AppConfig['logParams'] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const entries = Object.entries(value as Record<string, unknown>).filter(
		(entry): entry is [string, NLogLevel] => typeof entry[0] === 'string' && Object.values(NLogLevel).includes(entry[1] as NLogLevel)
	);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeLogLevel(value: unknown): AppConfig['logLevel'] {
	return Object.values(LogLevel).includes(value as LogLevel) ? (value as LogLevel) : undefined;
}

function normalizeViewConfigs(value: unknown): AppConfig['viewConfigs'] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const viewConfigs = value as Record<string, unknown>;
	const mainConfig =
		viewConfigs.main && typeof viewConfigs.main === 'object' && !Array.isArray(viewConfigs.main)
			? normalizeMainCollectionConfig(viewConfigs.main)
			: undefined;
	const blockLookupConfig =
		viewConfigs.blockLookup && typeof viewConfigs.blockLookup === 'object' && !Array.isArray(viewConfigs.blockLookup)
			? normalizeBlockLookupViewConfig(viewConfigs.blockLookup)
			: undefined;
	return {
		...(mainConfig && Object.keys(mainConfig).length > 0 ? { main: mainConfig } : {}),
		...(blockLookupConfig && Object.keys(blockLookupConfig).length > 0 ? { blockLookup: blockLookupConfig } : {})
	} as AppConfig['viewConfigs'];
}

export function createDefaultAppConfig(platform: string): AppConfig {
	return {
		gameExec: getDefaultExecutablePath(platform),
		workshopID: DEFAULT_WORKSHOP_ID,

		logsDir: '',

		closeOnLaunch: false,
		language: 'english',
		treatNuterraSteamBetaAsEquivalent: true,
		activeCollection: undefined,
		steamMaxConcurrency: 5,

		currentPath: DEFAULT_COLLECTIONS_PATH,

		viewConfigs: {},

		ignoredValidationErrors: new Map(),

		userOverrides: new Map()
	};
}

export function normalizeAppConfig(value: Partial<AppConfig> | Record<string, unknown>, platform: string): AppConfig {
	const defaults = createDefaultAppConfig(platform);
	const config = value as Record<string, unknown>;

	return {
		...defaults,
		...config,
		closeOnLaunch: typeof config.closeOnLaunch === 'boolean' ? config.closeOnLaunch : defaults.closeOnLaunch,
		language: typeof config.language === 'string' ? config.language : defaults.language,
		localDir: typeof config.localDir === 'string' ? config.localDir : undefined,
		gameExec: typeof config.gameExec === 'string' ? config.gameExec : defaults.gameExec,
		workshopID: toWorkshopId(config.workshopID, defaults.workshopID),
		activeCollection: typeof config.activeCollection === 'string' && config.activeCollection.trim() ? config.activeCollection : undefined,
		extraParams: typeof config.extraParams === 'string' ? config.extraParams : undefined,
		logParams: normalizeLogParams(config.logParams),
		logLevel: normalizeLogLevel(config.logLevel),
		pureVanilla: typeof config.pureVanilla === 'boolean' ? config.pureVanilla : undefined,
		logsDir: typeof config.logsDir === 'string' ? config.logsDir : defaults.logsDir,
		steamMaxConcurrency:
			typeof config.steamMaxConcurrency === 'number' && Number.isInteger(config.steamMaxConcurrency) && config.steamMaxConcurrency > 0
				? config.steamMaxConcurrency
				: defaults.steamMaxConcurrency,
		currentPath: typeof config.currentPath === 'string' ? getStoredViewPath(config.currentPath) : defaults.currentPath,
		viewConfigs: normalizeViewConfigs(config.viewConfigs),
		ignoredValidationErrors: normalizeIgnoredValidationErrors(config.ignoredValidationErrors),
		userOverrides: normalizeUserOverrides(config.userOverrides),
		treatNuterraSteamBetaAsEquivalent:
			typeof config.treatNuterraSteamBetaAsEquivalent === 'boolean' ? config.treatNuterraSteamBetaAsEquivalent : true
	};
}

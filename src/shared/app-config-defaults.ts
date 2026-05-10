import type { AppConfig } from 'model/AppConfig';
import { ModErrorType } from 'model/CollectionValidation';
import type { ModDataOverride } from 'model/Mod';

const DEFAULT_WORKSHOP_ID = BigInt(2790161231);

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
	if (typeof value === 'bigint') {
		return value;
	}
	if (typeof value === 'number' && Number.isInteger(value)) {
		return BigInt(value);
	}
	if (typeof value === 'string' && /^\d+$/.test(value)) {
		return BigInt(value);
	}
	return fallback;
}

function normalizeIgnoredValidationErrors(value: unknown): AppConfig['ignoredValidationErrors'] {
	if (value instanceof Map) {
		return new Map(value) as AppConfig['ignoredValidationErrors'];
	}
	if (!value || typeof value !== 'object') {
		return new Map();
	}

	const convertedMap: AppConfig['ignoredValidationErrors'] = new Map();
	Object.entries(value as Record<string, { [uid: string]: string[] }>).forEach(([key, ignoredErrors]) => {
		convertedMap.set(parseInt(key, 10) as ModErrorType, ignoredErrors);
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

	return new Map(Object.entries(value as Record<string, ModDataOverride>));
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

		currentPath: '/collections/main',

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
		gameExec: typeof config.gameExec === 'string' ? config.gameExec : defaults.gameExec,
		workshopID: toWorkshopId(config.workshopID, defaults.workshopID),
		logsDir: typeof config.logsDir === 'string' ? config.logsDir : defaults.logsDir,
		steamMaxConcurrency:
			typeof config.steamMaxConcurrency === 'number' && Number.isInteger(config.steamMaxConcurrency) && config.steamMaxConcurrency > 0
				? config.steamMaxConcurrency
				: defaults.steamMaxConcurrency,
		currentPath: typeof config.currentPath === 'string' ? config.currentPath : defaults.currentPath,
		viewConfigs: config.viewConfigs && typeof config.viewConfigs === 'object' ? (config.viewConfigs as AppConfig['viewConfigs']) : {},
		ignoredValidationErrors: normalizeIgnoredValidationErrors(config.ignoredValidationErrors),
		userOverrides: normalizeUserOverrides(config.userOverrides),
		treatNuterraSteamBetaAsEquivalent:
			typeof config.treatNuterraSteamBetaAsEquivalent === 'boolean' ? config.treatNuterraSteamBetaAsEquivalent : true
	};
}

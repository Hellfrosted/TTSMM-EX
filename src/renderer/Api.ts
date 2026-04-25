/* eslint-disable class-methods-use-this */

import type { AppConfig, NLogLevel } from 'model/AppConfig';
import type { ModData } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import { SessionMods } from 'model/SessionMods';
import { LogLevel, PathType } from 'shared/ipc';
import type {
	BlockLookupBuildRequest,
	BlockLookupBuildResult,
	BlockLookupIndexStats,
	BlockLookupSearchRequest,
	BlockLookupSearchResult,
	BlockLookupSettings
} from 'shared/block-lookup';
import type { ElectronLogFunctions, ElectronPlatform, ProgressChangeCallback, Unsubscribe } from 'shared/electron-api';
import type { SteamworksStatus } from 'shared/ipc';

const EXTRA_PARAM_PATTERN = /"([^"]*)"|'([^']*)'|[^\s]+/g;

export function parseExtraLaunchParams(extraParams: string): string[] {
	const matches = extraParams.matchAll(EXTRA_PARAM_PATTERN);
	return [...matches].map((match) => match[1] ?? match[2] ?? match[0]).filter((arg) => arg.length > 0);
}

class API {
	platform: ElectronPlatform;

	userDataPath: string | undefined;

	logger: ElectronLogFunctions;

	constructor(window: Window) {
		this.platform = window.electron.platform;
		this.logger = {
			info: (message) => {
				window.electron.log.info(message);
			},
			debug: (message) => {
				window.electron.log.debug(message);
			},
			warn: (message) => {
				window.electron.log.warn(message);
			},
			error: (message) => {
				window.electron.log.error(message);
			},
			silly: (message) => {
				window.electron.log.silly(message);
			},
			verbose: (message) => {
				window.electron.log.verbose(message);
			}
		};
	}

	async getUserDataPath() {
		if (this.userDataPath === undefined) {
			return window.electron.getUserDataPath().then((resolvedPath: string) => {
				this.userDataPath = resolvedPath;
				return resolvedPath;
			});
		}
		return this.userDataPath;
	}

	updateLogLevel(level: LogLevel) {
		window.electron.updateLogLevel(level);
	}

	launchGame(
		gameExec: string,
		workshopID: string | bigint,
		closeOnLaunch: boolean,
		modList: ModData[],
		pureVanilla?: boolean,
		logParams?: { [loggerID: string]: NLogLevel },
		extraParams?: string
	): Promise<boolean> {
		const workshopIDText = workshopID.toString();
		const actualMods = modList
			.filter((modData) => modData && modData.workshopID !== BigInt(workshopIDText))
			.map((mod: ModData) => {
				return mod ? `[${mod.uid.toString().replaceAll(' ', ':/%20')}]` : '';
			});
		let args: string[] = [];
		let passedWorkshopID: string | null = workshopIDText;

		let addMods = true;
		if (actualMods.length === 0 || (actualMods.length === 1 && actualMods[0] === '[workshop:2571814511]')) {
			if (pureVanilla) {
				passedWorkshopID = null;
				addMods = false;
			}
		}
		if (addMods) {
			const modListStr: string = actualMods.join(',');
			args.push('+ttsmm_mod_list');
			args.push(`[${modListStr}]`);
			if (logParams) {
				Object.entries(logParams).forEach(([loggerID, logLevel]: [string, NLogLevel]) => {
					args.push(loggerID && loggerID.length > 0 ? `+log_level_${loggerID}` : '+log_level');
					args.push(logLevel);
				});
			}
		}
		if (extraParams) {
			args = args.concat(parseExtraLaunchParams(extraParams));
		}
		return window.electron.launchGame(gameExec, passedWorkshopID, closeOnLaunch, args);
	}

	gameRunning(): Promise<boolean> {
		return window.electron.isGameRunning();
	}

	onProgressChange(callback: ProgressChangeCallback): Unsubscribe {
		return window.electron.onProgressChange(callback);
	}

	onModMetadataUpdate(callback: (uid: string, update: Partial<ModData>) => void): Unsubscribe {
		return window.electron.onModMetadataUpdate(callback);
	}

	onModRefreshRequested(callback: () => void): Unsubscribe {
		return window.electron.onModRefreshRequested(callback);
	}

	onReloadSteamworks(callback: () => void): Unsubscribe {
		return window.electron.onReloadSteamworks(callback);
	}

	pathExists(targetPath: string, type?: PathType): Promise<boolean> {
		return window.electron.pathExists(targetPath, type);
	}

	discoverGameExecutable(): Promise<string | null> {
		return window.electron.discoverGameExecutable();
	}

	readConfig(): Promise<AppConfig | null> {
		return window.electron.readConfig();
	}

	updateConfig(config: AppConfig): Promise<boolean> {
		return window.electron.updateConfig(config);
	}

	readCollection(collection: string): Promise<ModCollection | null> {
		return window.electron.readCollection(collection);
	}

	readCollectionsList(): Promise<string[]> {
		return window.electron.readCollectionsList();
	}

	updateCollection(collection: ModCollection): Promise<boolean> {
		return window.electron.updateCollection(collection);
	}

	deleteCollection(collection: string): Promise<boolean> {
		return window.electron.deleteCollection(collection);
	}

	renameCollection(collection: ModCollection, newName: string): Promise<boolean> {
		return window.electron.renameCollection(collection, newName);
	}

	selectPath(directory: boolean, title: string): Promise<string | null> {
		return window.electron.selectPath(directory, title);
	}

	readBlockLookupSettings(): Promise<BlockLookupSettings> {
		return window.electron.readBlockLookupSettings();
	}

	saveBlockLookupSettings(settings: BlockLookupSettings): Promise<BlockLookupSettings> {
		return window.electron.saveBlockLookupSettings(settings);
	}

	buildBlockLookupIndex(request: BlockLookupBuildRequest): Promise<BlockLookupBuildResult> {
		return window.electron.buildBlockLookupIndex(request);
	}

	searchBlockLookup(request: BlockLookupSearchRequest): Promise<BlockLookupSearchResult> {
		return window.electron.searchBlockLookup(request);
	}

	getBlockLookupStats(): Promise<BlockLookupIndexStats | null> {
		return window.electron.getBlockLookupStats();
	}

	autoDetectBlockLookupWorkshopRoot(request: BlockLookupBuildRequest): Promise<string | null> {
		return window.electron.autoDetectBlockLookupWorkshopRoot(request);
	}

	readModMetadata(localDir: string | undefined, allKnownMods: Set<string>): Promise<SessionMods> {
		return window.electron.readModMetadata(localDir, [...allKnownMods]);
	}

	fetchWorkshopDependencies(workshopID: bigint): Promise<boolean> {
		return window.electron.fetchWorkshopDependencies(workshopID);
	}

	steamworksInited(): Promise<SteamworksStatus> {
		return window.electron.steamworksInited();
	}

	openModBrowser(workshopID: bigint) {
		window.electron.openModBrowser(workshopID);
	}

	openModSteam(workshopID: bigint) {
		window.electron.openModSteam(workshopID);
	}

	openModContextMenu(record: ModData) {
		window.electron.openModContextMenu(record);
	}

	downloadMod(workshopID: bigint): Promise<boolean> {
		return window.electron.downloadMod(workshopID);
	}

	subscribeMod(workshopID: bigint): Promise<boolean> {
		return window.electron.subscribeMod(workshopID);
	}

	unsubscribeMod(workshopID: bigint): Promise<boolean> {
		return window.electron.unsubscribeMod(workshopID);
	}
}

export default new API(window);

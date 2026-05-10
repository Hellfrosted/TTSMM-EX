/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AppConfig, LogLevel, ModCollection, ModData, NLogLevel, PathType, SessionMods } from 'model';
import type { ProgressChangeCallback, Unsubscribe } from 'shared/electron-api';
import type { SteamworksStatus } from 'shared/ipc';

const EXTRA_PARAM_PATTERN = /"([^"]*)"|'([^']*)'|[^\s]+/g;

export function parseExtraLaunchParams(extraParams: string): string[] {
	const matches = extraParams.matchAll(EXTRA_PARAM_PATTERN);
	return [...matches].map((match) => match[1] ?? match[2] ?? match[0]).filter((arg) => arg.length > 0);
}

class API {
	platform: string;

	userDataPath: string | undefined;

	logger: {
		info: (...message: any[]) => void;
		debug: (...message: any[]) => void;
		warn: (...message: any[]) => void;
		error: (...message: any[]) => void;
		silly: (...message: any[]) => void;
		verbose: (...message: any[]) => void;
	};

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
		workshopID: string,
		closeOnLaunch: boolean,
		modList: ModData[],
		pureVanilla?: boolean,
		logParams?: { [loggerID: string]: NLogLevel },
		extraParams?: string
	): Promise<boolean> {
		const actualMods = modList
			.filter((modData) => modData && modData.workshopID !== BigInt(workshopID))
			.map((mod: ModData) => {
				return mod ? `[${mod.uid.toString().replaceAll(' ', ':/%20')}]` : '';
			});
		let args: string[] = [];
		let passedWorkshopID: string | null = workshopID;

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

	onModMetadataUpdate(callback: (uid: string, update: any) => void): Unsubscribe {
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

	readModMetadata(localDir: string | undefined, allKnownMods: Set<string>): Promise<SessionMods | null> {
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

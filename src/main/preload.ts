import { contextBridge, ipcRenderer } from 'electron';
import log from 'electron-log';
import type { ElectronApi } from 'shared/electron-api';
import { ValidChannel } from 'shared/ipc';

const invoke = <TResult>(channel: ValidChannel, ...args: unknown[]): Promise<TResult> => {
	return ipcRenderer.invoke(channel, ...args) as Promise<TResult>;
};

const send = (channel: ValidChannel, ...args: unknown[]) => {
	ipcRenderer.send(channel, ...args);
};

const subscribe = <TArgs extends unknown[]>(channel: ValidChannel, callback: (...args: TArgs) => void) => {
	const listener = (_event: unknown, ...args: unknown[]) => callback(...(args as TArgs));
	ipcRenderer.on(channel, listener);
	return () => {
		ipcRenderer.removeListener(channel, listener);
	};
};

const electronApi: ElectronApi = {
	platform: process.platform,
	log: log.functions,
	updateLogLevel: (level) => {
		send(ValidChannel.UPDATE_LOG_LEVEL, level);
	},
	getUserDataPath: () => invoke(ValidChannel.USER_DATA_PATH),
	readConfig: () => invoke(ValidChannel.READ_CONFIG),
	updateConfig: (config) => invoke(ValidChannel.UPDATE_CONFIG, config),
	readCollection: (collection) => invoke(ValidChannel.READ_COLLECTION, collection),
	readCollectionsList: () => invoke(ValidChannel.READ_COLLECTIONS),
	updateCollection: (collection) => invoke(ValidChannel.UPDATE_COLLECTION, collection),
	renameCollection: (collection, newName) => invoke(ValidChannel.RENAME_COLLECTION, collection, newName),
	deleteCollection: (collection) => invoke(ValidChannel.DELETE_COLLECTION, collection),
	pathExists: (targetPath, expectedType) => invoke(ValidChannel.PATH_EXISTS, targetPath, expectedType),
	discoverGameExecutable: () => invoke(ValidChannel.DISCOVER_GAME_EXEC),
	selectPath: (directory, title) => invoke(ValidChannel.SELECT_PATH, directory, title),
	readBlockLookupSettings: () => invoke(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS),
	saveBlockLookupSettings: (settings) => invoke(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, settings),
	buildBlockLookupIndex: (request) => invoke(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, request),
	searchBlockLookup: (request) => invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, request),
	getBlockLookupStats: () => invoke(ValidChannel.BLOCK_LOOKUP_STATS),
	autoDetectBlockLookupWorkshopRoot: (request) => invoke(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, request),
	launchGame: (gameExec: string, workshopID: string | bigint | null, closeOnLaunch: boolean, args: string[]) =>
		invoke(ValidChannel.LAUNCH_GAME, gameExec, workshopID, closeOnLaunch, args),
	isGameRunning: () => invoke(ValidChannel.GAME_RUNNING),
	readModMetadata: (localDir, allKnownMods) => invoke(ValidChannel.READ_MOD_METADATA, localDir, allKnownMods),
	fetchWorkshopDependencies: (workshopID) => invoke(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, workshopID),
	steamworksInited: () => invoke(ValidChannel.STEAMWORKS_INITED),
	downloadMod: (workshopID) => invoke(ValidChannel.DOWNLOAD_MOD, workshopID),
	subscribeMod: (workshopID) => invoke(ValidChannel.SUBSCRIBE_MOD, workshopID),
	unsubscribeMod: (workshopID) => invoke(ValidChannel.UNSUBSCRIBE_MOD, workshopID),
	openModBrowser: (workshopID) => {
		send(ValidChannel.OPEN_MOD_BROWSER, workshopID);
	},
	openModSteam: (workshopID) => {
		send(ValidChannel.OPEN_MOD_STEAM, workshopID);
	},
	openModContextMenu: (record) => {
		send(ValidChannel.OPEN_MOD_CONTEXT_MENU, record);
	},
	onProgressChange: (callback) => subscribe(ValidChannel.PROGRESS_CHANGE, callback),
	onModMetadataUpdate: (callback) => subscribe(ValidChannel.MOD_METADATA_UPDATE, callback),
	onModRefreshRequested: (callback) => subscribe(ValidChannel.MOD_REFRESH_REQUESTED, callback),
	onReloadSteamworks: (callback) => subscribe(ValidChannel.RELOAD_STEAMWORKS, callback)
};

contextBridge.exposeInMainWorld('electron', electronApi);

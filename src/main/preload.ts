import { contextBridge, ipcRenderer } from 'electron';
import log from 'electron-log';
import type { ElectronApi } from 'shared/electron-api';
import { ValidChannel } from 'shared/ipc';

const subscribe = <TArgs extends unknown[]>(channel: string, callback: (...args: TArgs) => void) => {
	const listener = (_event: unknown, ...args: unknown[]) => callback(...(args as TArgs));
	ipcRenderer.on(channel, listener);
	return () => {
		ipcRenderer.removeListener(channel, listener);
	};
};

const electronApi = {
	platform: process.platform,
	log: log.functions,
	updateLogLevel: (level) => {
		ipcRenderer.send(ValidChannel.UPDATE_LOG_LEVEL, level);
	},
	getUserDataPath: () => ipcRenderer.invoke(ValidChannel.USER_DATA_PATH),
	readConfig: () => ipcRenderer.invoke(ValidChannel.READ_CONFIG),
	updateConfig: (config) => ipcRenderer.invoke(ValidChannel.UPDATE_CONFIG, config),
	readCollection: (collection: string) => ipcRenderer.invoke(ValidChannel.READ_COLLECTION, collection),
	readCollectionsList: () => ipcRenderer.invoke(ValidChannel.READ_COLLECTIONS),
	updateCollection: (collection) => ipcRenderer.invoke(ValidChannel.UPDATE_COLLECTION, collection),
	renameCollection: (collection, newName: string) => ipcRenderer.invoke(ValidChannel.RENAME_COLLECTION, collection, newName),
	deleteCollection: (collection: string) => ipcRenderer.invoke(ValidChannel.DELETE_COLLECTION, collection),
	pathExists: (targetPath: string, expectedType?: number) => ipcRenderer.invoke(ValidChannel.PATH_EXISTS, targetPath, expectedType),
	discoverGameExecutable: () => ipcRenderer.invoke(ValidChannel.DISCOVER_GAME_EXEC),
	selectPath: (directory: boolean, title: string) => ipcRenderer.invoke(ValidChannel.SELECT_PATH, directory, title),
	launchGame: (gameExec: string, workshopID: string | bigint | null, closeOnLaunch: boolean, args: string[]) =>
		ipcRenderer.invoke(ValidChannel.LAUNCH_GAME, gameExec, workshopID, closeOnLaunch, args),
	isGameRunning: () => ipcRenderer.invoke(ValidChannel.GAME_RUNNING),
	readModMetadata: (localDir: string | undefined, allKnownMods: string[]) => ipcRenderer.invoke(ValidChannel.READ_MOD_METADATA, localDir, allKnownMods),
	fetchWorkshopDependencies: (workshopID: bigint) => ipcRenderer.invoke(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, workshopID),
	steamworksInited: () => ipcRenderer.invoke(ValidChannel.STEAMWORKS_INITED),
	downloadMod: (workshopID: bigint) => ipcRenderer.invoke(ValidChannel.DOWNLOAD_MOD, workshopID),
	subscribeMod: (workshopID: bigint) => ipcRenderer.invoke(ValidChannel.SUBSCRIBE_MOD, workshopID),
	unsubscribeMod: (workshopID: bigint) => ipcRenderer.invoke(ValidChannel.UNSUBSCRIBE_MOD, workshopID),
	openModBrowser: (workshopID: bigint) => {
		ipcRenderer.send(ValidChannel.OPEN_MOD_BROWSER, workshopID);
	},
	openModSteam: (workshopID: bigint) => {
		ipcRenderer.send(ValidChannel.OPEN_MOD_STEAM, workshopID);
	},
	openModContextMenu: (record) => {
		ipcRenderer.send(ValidChannel.OPEN_MOD_CONTEXT_MENU, record);
	},
	onProgressChange: (callback) => subscribe(ValidChannel.PROGRESS_CHANGE, callback),
	onModMetadataUpdate: (callback) => subscribe(ValidChannel.MOD_METADATA_UPDATE, callback),
	onModRefreshRequested: (callback) => subscribe(ValidChannel.MOD_REFRESH_REQUESTED, callback),
	onReloadSteamworks: (callback) => subscribe(ValidChannel.RELOAD_STEAMWORKS, callback)
} satisfies ElectronApi;

contextBridge.exposeInMainWorld('electron', electronApi);

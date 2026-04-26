import { contextBridge, ipcRenderer } from 'electron';
import log from 'electron-log';
import type { ElectronApi } from 'shared/electron-api';
import { ipcInvokeChannels, ipcSendChannels, ipcSubscriptionChannels } from 'shared/ipc-contract';
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
		send(ipcSendChannels.updateLogLevel, level);
	},
	getUserDataPath: () => invoke(ipcInvokeChannels.getUserDataPath),
	readConfig: () => invoke(ipcInvokeChannels.readConfig),
	updateConfig: (config) => invoke(ipcInvokeChannels.updateConfig, config),
	readCollection: (collection) => invoke(ipcInvokeChannels.readCollection, collection),
	readCollectionsList: () => invoke(ipcInvokeChannels.readCollectionsList),
	updateCollection: (collection) => invoke(ipcInvokeChannels.updateCollection, collection),
	renameCollection: (collection, newName) => invoke(ipcInvokeChannels.renameCollection, collection, newName),
	deleteCollection: (collection) => invoke(ipcInvokeChannels.deleteCollection, collection),
	pathExists: (targetPath, expectedType) => invoke(ipcInvokeChannels.pathExists, targetPath, expectedType),
	discoverGameExecutable: () => invoke(ipcInvokeChannels.discoverGameExecutable),
	selectPath: (directory, title) => invoke(ipcInvokeChannels.selectPath, directory, title),
	readBlockLookupSettings: () => invoke(ipcInvokeChannels.readBlockLookupSettings),
	saveBlockLookupSettings: (settings) => invoke(ipcInvokeChannels.saveBlockLookupSettings, settings),
	buildBlockLookupIndex: (request) => invoke(ipcInvokeChannels.buildBlockLookupIndex, request),
	searchBlockLookup: (request) => invoke(ipcInvokeChannels.searchBlockLookup, request),
	getBlockLookupStats: () => invoke(ipcInvokeChannels.getBlockLookupStats),
	autoDetectBlockLookupWorkshopRoot: (request) => invoke(ipcInvokeChannels.autoDetectBlockLookupWorkshopRoot, request),
	launchGame: (gameExec: string, workshopID: string | bigint | null, closeOnLaunch: boolean, args: string[]) =>
		invoke(ipcInvokeChannels.launchGame, gameExec, workshopID, closeOnLaunch, args),
	isGameRunning: () => invoke(ipcInvokeChannels.isGameRunning),
	readModMetadata: (localDir, allKnownMods) => invoke(ipcInvokeChannels.readModMetadata, localDir, allKnownMods),
	fetchWorkshopDependencies: (workshopID) => invoke(ipcInvokeChannels.fetchWorkshopDependencies, workshopID),
	steamworksInited: () => invoke(ipcInvokeChannels.steamworksInited),
	downloadMod: (workshopID) => invoke(ipcInvokeChannels.downloadMod, workshopID),
	subscribeMod: (workshopID) => invoke(ipcInvokeChannels.subscribeMod, workshopID),
	unsubscribeMod: (workshopID) => invoke(ipcInvokeChannels.unsubscribeMod, workshopID),
	openModBrowser: (workshopID) => {
		send(ipcSendChannels.openModBrowser, workshopID);
	},
	openModSteam: (workshopID) => {
		send(ipcSendChannels.openModSteam, workshopID);
	},
	openModContextMenu: (record) => {
		send(ipcSendChannels.openModContextMenu, record);
	},
	onProgressChange: (callback) => subscribe(ipcSubscriptionChannels.onProgressChange, callback),
	onModMetadataUpdate: (callback) => subscribe(ipcSubscriptionChannels.onModMetadataUpdate, callback),
	onModRefreshRequested: (callback) => subscribe(ipcSubscriptionChannels.onModRefreshRequested, callback),
	onReloadSteamworks: (callback) => subscribe(ipcSubscriptionChannels.onReloadSteamworks, callback)
};

contextBridge.exposeInMainWorld('electron', electronApi);

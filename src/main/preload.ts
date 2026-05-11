import { contextBridge, ipcRenderer } from 'electron';
import log from 'electron-log';
import type { ElectronApi } from 'shared/electron-api';
import { ValidChannel } from 'shared/ipc';
import { ipcInvokeChannels, ipcSendChannels, ipcSubscriptionChannels } from 'shared/ipc-contract';
import { isUiSmokeRunRequest } from 'shared/ui-smoke';

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

type IpcInvokeApi = Pick<ElectronApi, keyof typeof ipcInvokeChannels>;

function createInvokeApi(): IpcInvokeApi {
	return Object.fromEntries(
		Object.entries(ipcInvokeChannels).map(([method, channel]) => [method, (...args: unknown[]) => invoke(channel, ...args)])
	) as IpcInvokeApi;
}

const electronApi: ElectronApi = {
	...createInvokeApi(),
	platform: process.platform,
	uiSmokeMode: isUiSmokeRunRequest(process.env, process.argv),
	log: log.functions,
	updateLogLevel: (level) => {
		send(ipcSendChannels.updateLogLevel, level);
	},
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
	onBlockLookupIndexProgress: (callback) => subscribe(ipcSubscriptionChannels.onBlockLookupIndexProgress, callback),
	onModMetadataUpdate: (callback) => subscribe(ipcSubscriptionChannels.onModMetadataUpdate, callback),
	onModRefreshRequested: (callback) => subscribe(ipcSubscriptionChannels.onModRefreshRequested, callback),
	onReloadSteamworks: (callback) => subscribe(ipcSubscriptionChannels.onReloadSteamworks, callback)
};

contextBridge.exposeInMainWorld('electron', electronApi);

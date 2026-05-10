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

type IpcInvokeApi = Pick<ElectronApi, keyof typeof ipcInvokeChannels>;

function createInvokeApi(): IpcInvokeApi {
	return Object.fromEntries(
		Object.entries(ipcInvokeChannels).map(([method, channel]) => [method, (...args: unknown[]) => invoke(channel, ...args)])
	) as IpcInvokeApi;
}

const electronApi: ElectronApi = {
	...createInvokeApi(),
	platform: process.platform,
	uiSmokeMode:
		process.env.TTSMM_EX_UI_SMOKE === '1' || process.argv.includes('--ttsmm-ex-ui-smoke') || process.argv.includes('ttsmm-ex-ui-smoke'),
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
	onModMetadataUpdate: (callback) => subscribe(ipcSubscriptionChannels.onModMetadataUpdate, callback),
	onModRefreshRequested: (callback) => subscribe(ipcSubscriptionChannels.onModRefreshRequested, callback),
	onReloadSteamworks: (callback) => subscribe(ipcSubscriptionChannels.onReloadSteamworks, callback)
};

contextBridge.exposeInMainWorld('electron', electronApi);

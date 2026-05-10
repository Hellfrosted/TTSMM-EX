/* eslint global-require: off, no-console: off */

import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import log from 'electron-log';
import path from 'path';

import Steamworks from './steamworks';
import { registerCollectionHandlers } from './ipc/collection-handlers';
import { registerConfigHandlers } from './ipc/config-handlers';
import { registerGameHandlers } from './ipc/game-handlers';
import { registerModHandlers } from './ipc/mod-handlers';
import { registerPreviewProtocol } from './preview-protocol';
import { createMainWindow } from './window';

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';
const FORK_APP_ID = 'com.hellfrosted.ttsmmex';
// Keep the existing userData directory name so upgrades do not split stored config and collections.
const FORK_USER_DATA_DIR = 'TerraTech Steam Mod Manager EX';
const ELECTRON_NODE_MODE_HINT = [
	'Electron main-process APIs are unavailable.',
	'This usually means ELECTRON_RUN_AS_NODE leaked into the launch environment.',
	'Start the app with npm run dev or npm run start:desktop, or unset ELECTRON_RUN_AS_NODE before launching Electron directly.'
].join(' ');

class ApplicationLogging {
	constructor() {
		log.transports.file.level = isDevelopment ? 'debug' : 'warn';
		log.transports.console.level = isDevelopment ? 'debug' : 'warn';
		log.initialize();
	}
}

let mainWindow: BrowserWindow | null = null;
let steamworksInited = false;
let steamworksError: string | undefined;
let previewProtocolRegistered = false;

if (!app || typeof app.setPath !== 'function') {
	throw new Error(ELECTRON_NODE_MODE_HINT);
}

app.setPath('userData', path.join(app.getPath('appData'), FORK_USER_DATA_DIR));
if (process.platform === 'win32') {
	app.setAppUserModelId(FORK_APP_ID);
}

async function installProductionSourceMaps() {
	if (process.env.NODE_ENV !== 'production') {
		return;
	}

	const sourceMapSupportModule = await import('source-map-support');
	sourceMapSupportModule.install();
}

async function enableDevelopmentDebugging() {
	if (!isDevelopment) {
		return;
	}

	const electronDebugModule = await import('electron-debug');
	const electronDebug = electronDebugModule.default;
	electronDebug();
}

function getSteamStatus() {
	return {
		inited: steamworksInited,
		error: steamworksError
	};
}

function tryInitSteamworks() {
	try {
		steamworksInited = Steamworks.init();
		steamworksError = undefined;
	} catch (error) {
		steamworksInited = false;
		steamworksError = (error as Error).toString();
		log.error(error);
	}
	return getSteamStatus();
}

async function createWindow() {
	mainWindow = await createMainWindow({
		isDevelopment,
		onDidFinishLoad: () => {
			tryInitSteamworks();
		}
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

registerConfigHandlers(ipcMain, isDevelopment);
registerCollectionHandlers(ipcMain);
registerGameHandlers(ipcMain);
registerModHandlers(
	ipcMain,
	{
		getWebContents: () => mainWindow?.webContents || null
	},
	getSteamStatus,
	tryInitSteamworks
);

app
	.whenReady()
	.then(async () => {
		await installProductionSourceMaps();
		await enableDevelopmentDebugging();
		if (!previewProtocolRegistered) {
			registerPreviewProtocol(protocol);
			previewProtocolRegistered = true;
		}
		await createWindow();
		app.on('activate', () => {
			if (mainWindow === null) {
				void createWindow();
			}
		});
		return undefined;
	})
	.catch((error) => {
		log.error(error);
		return undefined;
	});

new ApplicationLogging();

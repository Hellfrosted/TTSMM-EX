import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, WebContents } from 'electron';
import log from 'electron-log';

import { openExternalUrl } from './external-links';
import MenuBuilder from './menu';
import { resolveHtmlPath, resolvePreloadPath } from './util';

export interface WindowOptions {
	isDevelopment: boolean;
	onDidFinishLoad: () => void;
}

export function ensureSteamAppIdFile() {
	if (fs.existsSync('steam_appid.txt')) {
		const appID = fs.readFileSync('steam_appid.txt', 'utf8');
		if (!appID.toString().startsWith('285920')) {
			fs.writeFileSync('steam_appid.txt', '285920\n', 'utf8');
		}
	} else {
		fs.writeFileSync('steam_appid.txt', '285920\n', 'utf8');
	}
}

export async function installExtensions() {
	const installer = await import('electron-devtools-installer');
	const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
	const extensions = [installer.REACT_DEVELOPER_TOOLS];

	try {
		const installedExtensions = await installer.installExtension(extensions, { forceDownload });
		const installedNames = installedExtensions.map((extension) => extension.name).join(', ');
		log.info(`Installed devtools extensions: ${installedNames}`);
		return installedExtensions;
	} catch (error) {
		log.error('Failed to install devtools extensions');
		log.error(error);
		return undefined;
	}
}

export async function createMainWindow({ isDevelopment, onDidFinishLoad }: WindowOptions): Promise<BrowserWindow> {
	if (isDevelopment) {
		await installExtensions();
	}

	const resourcesPath = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '../../assets');
	const getAssetPath = (...paths: string[]): string => {
		return path.join(resourcesPath, ...paths);
	};

	const mainWindow = new BrowserWindow({
		show: false,
		width: 1080,
		height: 728,
		minWidth: 1080,
		minHeight: 728,
		autoHideMenuBar: process.platform !== 'darwin',
		icon: getAssetPath('icon.png'),
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: resolvePreloadPath()
		}
	});

	mainWindow.loadURL(resolveHtmlPath('index.html'));

	mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
		const formattedMessage = `[renderer console:${level}] ${message} (${sourceId}:${line})`;
		if (level >= 3) {
			console.error(formattedMessage);
			return;
		}
		if (level === 2) {
			console.warn(formattedMessage);
			return;
		}
		console.info(formattedMessage);
	});

	mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		log.error(`Renderer failed to load. code=${errorCode} description=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`);
	});

	mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
		log.error(`Preload failed at ${preloadPath}`);
		log.error(error);
	});

	mainWindow.webContents.on('render-process-gone', (_event, details) => {
		log.error(`Renderer process gone. reason=${details.reason} exitCode=${details.exitCode}`);
	});

	mainWindow.once('ready-to-show', () => {
		if (process.env.START_MINIMIZED) {
			mainWindow.minimize();
		} else {
			mainWindow.show();
			mainWindow.focus();
		}
	});

	const menuBuilder = new MenuBuilder(mainWindow);
	menuBuilder.buildMenu();
	if (process.platform !== 'darwin') {
		mainWindow.setMenuBarVisibility(false);
	}

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		openExternalUrl(url);
		return { action: 'deny' };
	});

	mainWindow.webContents.on('did-finish-load', () => {
		const name = 'TerraTech Steam Mod Manager';
		log.info(`App Version: ${app.getVersion()}`);
		log.info(`App Name: ${app.getName()}`);
		mainWindow.setTitle(`${name} v${app.getVersion()}`);
		mainWindow.maximize();
		ensureSteamAppIdFile();
		onDidFinishLoad();
		if (!isDevelopment) {
			void import('electron-updater')
				.then(({ autoUpdater }) => autoUpdater.checkForUpdates())
				.catch(log.error);
		}
	});

	return mainWindow;
}

export function getMainWindowWebContents(mainWindow: BrowserWindow | null): WebContents | null {
	return mainWindow?.webContents || null;
}

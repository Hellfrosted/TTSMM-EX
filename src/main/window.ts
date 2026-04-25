import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, type WebContentsConsoleMessageEventParams } from 'electron';
import log from 'electron-log';

import { openExternalUrl } from './external-links';
import MenuBuilder from './menu';
import { resolveHtmlPath, resolvePreloadPath } from './util';

const STEAM_APP_ID = '285920\n';
const STEAM_APP_ID_VALUE = '285920';
export const MAIN_WINDOW_DEFAULT_BOUNDS = Object.freeze({
	width: 1280,
	height: 820,
	minWidth: 720,
	minHeight: 600
});

interface WindowOptions {
	isDevelopment: boolean;
	onDidFinishLoad: () => void;
}

type RendererConsoleLogLevel = 'error' | 'warn' | 'info';

interface SteamAppIdFileOptions {
	isPackaged?: boolean;
	cwd?: string;
	exePath?: string;
	fsImpl?: Pick<typeof fs, 'existsSync' | 'readFileSync' | 'writeFileSync'>;
	logger?: Pick<typeof log, 'error'>;
}

interface RendererConsoleForwardOptions {
	consoleImpl?: Pick<Console, 'error' | 'warn' | 'info'>;
	logger?: Pick<typeof log, 'processMessage' | 'transports'>;
	mirrorToConsole?: boolean;
}

export function resolveSteamAppIdFilePath({
	isPackaged = app.isPackaged,
	cwd = process.cwd(),
	exePath = app.getPath('exe')
}: Pick<SteamAppIdFileOptions, 'isPackaged' | 'cwd' | 'exePath'> = {}) {
	const basePath = isPackaged ? path.dirname(exePath) : cwd;
	return path.join(basePath, 'steam_appid.txt');
}

export function ensureSteamAppIdFile(options: SteamAppIdFileOptions = {}) {
	const { fsImpl = fs, logger = log } = options;
	const steamAppIdPath = resolveSteamAppIdFilePath(options);

	try {
		if (fsImpl.existsSync(steamAppIdPath)) {
			const appID = fsImpl.readFileSync(steamAppIdPath, 'utf8');
			if (appID.toString().trim() !== STEAM_APP_ID_VALUE) {
				fsImpl.writeFileSync(steamAppIdPath, STEAM_APP_ID, 'utf8');
			}
		} else {
			fsImpl.writeFileSync(steamAppIdPath, STEAM_APP_ID, 'utf8');
		}
		return true;
	} catch (error) {
		logger.error(`Failed to ensure steam_appid.txt at ${steamAppIdPath}`);
		logger.error(error);
		return false;
	}
}

async function installExtensions() {
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

function resolveRendererConsoleLogLevel(level: WebContentsConsoleMessageEventParams['level']): RendererConsoleLogLevel {
	if (level === 'error') {
		return 'error';
	}
	if (level === 'warning') {
		return 'warn';
	}
	return 'info';
}

function isBrokenPipeError(error: unknown) {
	if (!(error instanceof Error)) {
		return false;
	}

	const errorCode = 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
	return errorCode === 'EPIPE' || error.message.toLowerCase().includes('broken pipe');
}

export function forwardRendererConsoleMessage(
	{ level, message, lineNumber, sourceId }: WebContentsConsoleMessageEventParams,
	{ consoleImpl = console, logger = log, mirrorToConsole = false }: RendererConsoleForwardOptions = {}
) {
	const formattedMessage = `[renderer console:${level}] ${message} (${sourceId}:${lineNumber})`;
	const logLevel = resolveRendererConsoleLogLevel(level);

	logger.processMessage(
		{
			date: new Date(),
			data: [formattedMessage],
			level: logLevel
		},
		{ transports: [logger.transports.file] }
	);

	if (!mirrorToConsole) {
		return;
	}

	try {
		consoleImpl[logLevel](formattedMessage);
	} catch (error) {
		if (!isBrokenPipeError(error)) {
			throw error;
		}
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
		...MAIN_WINDOW_DEFAULT_BOUNDS,
		autoHideMenuBar: process.platform !== 'darwin',
		icon: getAssetPath('icon.png'),
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: resolvePreloadPath()
		}
	});

	mainWindow.loadURL(resolveHtmlPath('index.html'));

	mainWindow.webContents.on('console-message', (event) => {
		forwardRendererConsoleMessage(event, {
			mirrorToConsole: isDevelopment
		});
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
		const name = 'TTSMM-EX';
		log.info(`App Version: ${app.getVersion()}`);
		log.info(`App Name: ${app.getName()}`);
		mainWindow.setTitle(`${name} v${app.getVersion()}`);
		ensureSteamAppIdFile();
		onDidFinishLoad();
		if (!isDevelopment) {
			void import('electron-updater').then(({ autoUpdater }) => autoUpdater.checkForUpdates()).catch(log.error);
		}
	});

	return mainWindow;
}

import child_process from 'child_process';
import fs from 'fs';
import { app, IpcMain, dialog, shell } from 'electron';
import log from 'electron-log';
import path from 'path';

import { PathType, ValidChannel } from '../../model';

interface ProcessDetails {
	pid: number;
	ppid: number;
	name: string;
}

const WINDOWS_TERRATECH_EXECUTABLE_PATH = path.join('steamapps', 'common', 'TerraTech', 'TerraTechWin64.exe');

function normalizePathValue(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const normalized = path.normalize(value.trim().replace(/^"+|"+$/g, '').replace(/\\\\/g, '\\'));
	return normalized.length > 0 ? normalized : null;
}

function parseSteamLibraryFolders(contents: string): string[] {
	return [...contents.matchAll(/"path"\s+"([^"]+)"/g)]
		.map((match) => normalizePathValue(match[1]))
		.filter((libraryPath): libraryPath is string => !!libraryPath);
}

function getWindowsSteamPathFromRegistry(execFileSync: typeof child_process.execFileSync = child_process.execFileSync): string | null {
	try {
		const output = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
			encoding: 'utf8'
		});
		const match = output.match(/SteamPath\s+REG_\w+\s+(.+)$/m);
		return normalizePathValue(match?.[1]);
	} catch {
		return null;
	}
}

function getWindowsSteamRoots(env: NodeJS.ProcessEnv, registrySteamPath?: string | null): string[] {
	const candidates = new Set<string>();
	const addCandidate = (candidate: string | null | undefined) => {
		const normalized = normalizePathValue(candidate);
		if (normalized) {
			candidates.add(normalized);
		}
	};

	addCandidate(registrySteamPath);
	[env['ProgramFiles(x86)'], env['PROGRAMFILES(X86)'], env.ProgramFiles, env.PROGRAMFILES].forEach((basePath) => {
		if (basePath) {
			addCandidate(path.join(basePath, 'Steam'));
		}
	});

	return [...candidates];
}

interface DiscoverGameExecutableOptions {
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	registrySteamPath?: string | null;
	existsSync?: typeof fs.existsSync;
	readFileSync?: typeof fs.readFileSync;
}

export function discoverGameExecutablePath({
	platform = process.platform,
	env = process.env,
	registrySteamPath = getWindowsSteamPathFromRegistry(),
	existsSync = fs.existsSync,
	readFileSync = fs.readFileSync
}: DiscoverGameExecutableOptions = {}): string | null {
	if (platform !== 'win32') {
		return null;
	}

	const libraryRoots = new Set<string>();
	const addLibraryRoot = (libraryRoot: string | null | undefined) => {
		const normalized = normalizePathValue(libraryRoot);
		if (normalized) {
			libraryRoots.add(normalized);
		}
	};

	getWindowsSteamRoots(env, registrySteamPath).forEach((steamRoot) => {
		addLibraryRoot(steamRoot);

		const libraryFoldersPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
		if (!existsSync(libraryFoldersPath)) {
			return;
		}

		try {
			const contents = readFileSync(libraryFoldersPath, 'utf8');
			parseSteamLibraryFolders(contents).forEach(addLibraryRoot);
		} catch (error) {
			log.warn(`Failed to read Steam library folders from ${libraryFoldersPath}`);
			log.warn(error);
		}
	});

	for (const libraryRoot of libraryRoots) {
		const executablePath = path.join(libraryRoot, WINDOWS_TERRATECH_EXECUTABLE_PATH);
		if (existsSync(executablePath)) {
			return path.normalize(executablePath);
		}
	}

	return null;
}

export async function isGameRunning(): Promise<boolean> {
	try {
		const { default: psList } = await import('ps-list');
		const processes: ProcessDetails[] = await psList();
		const matches = processes.filter((process) => /[Tt]erra[Tt]ech(?!.*[Mm]od)/.test(process.name));
		const running = matches.length > 0;
		if (running) {
			log.debug('Detected TerraTech is running:');
			log.debug(processes.filter((process) => /[Tt]erra[Tt]ech/.test(process.name)).map((process) => process.name));
		}
		return running;
	} catch (error) {
		log.error('Failed to get game running status. Defaulting to not running');
		log.error(error);
		return false;
	}
}

export function launchGameProcess(
	gameExec: string,
	workshopID: string | bigint | null | undefined,
	closeOnLaunch: boolean,
	args: string[],
	spawn: typeof child_process.spawn = child_process.spawn,
	openExternal?: typeof shell.openExternal,
	platform: NodeJS.Platform = process.platform,
	quit?: typeof app.quit
): Promise<boolean> {
	log.info('Launching game with custom args:');
	const allArgs = ['+custom_mod_list', workshopID ? `[workshop:${workshopID}]` : '[]', ...args];
	log.info(allArgs);
	const quitApp = quit ?? (() => app.quit());
	if (platform === 'linux') {
		const steamRunUrl = `steam://run/285920//${allArgs.join(' ')}/`;
		log.info(`Launching game via Steam protocol: ${steamRunUrl}`);
		const launchExternal = openExternal ?? ((url: string) => shell.openExternal(url));
		return launchExternal(steamRunUrl)
			.then(() => {
				if (closeOnLaunch) {
					quitApp();
				}
				return true;
			})
			.catch((error) => {
				log.error('Failed to launch game through Steam protocol');
				log.error(error);
				return false;
			});
	}
	try {
		const child = spawn(gameExec, allArgs, {
			detached: true
		});
		return new Promise((resolve) => {
			const settle = (success: boolean, error?: unknown) => {
				child.removeAllListeners('error');
				child.removeAllListeners('spawn');
				if (error) {
					log.error('Failed to launch game');
					log.error(error);
				}
				if (success) {
					child.unref();
					if (closeOnLaunch) {
						quitApp();
					}
				}
				resolve(success);
			};

			child.once('error', (error) => {
				settle(false, error);
			});

			child.once('spawn', () => {
				settle(true);
			});
		});
	} catch (error) {
		log.error('Failed to launch game');
		log.error(error);
		return Promise.resolve(false);
	}
}

export async function selectPath(directory: boolean, title: string): Promise<string | null> {
	try {
		const result = await dialog.showOpenDialog({
			title,
			properties: ['showHiddenFiles', directory ? 'openDirectory' : 'openFile', 'promptToCreate', 'createDirectory']
		});
		if (result.canceled) {
			return null;
		}
		return result.filePaths[0] || null;
	} catch (error) {
		log.error(error);
		return null;
	}
}

export function pathExists(targetPath: string, expectedType?: PathType): boolean {
	const normalizedTargetPath = targetPath?.trim();
	if (!normalizedTargetPath) {
		return false;
	}

	try {
		const stats = fs.statSync(normalizedTargetPath);
		if (expectedType === PathType.DIRECTORY) {
			return stats.isDirectory();
		}
		if (expectedType === PathType.FILE) {
			return stats.isFile();
		}
		return true;
	} catch (error) {
		log.error(error);
		return false;
	}
}

export function registerGameHandlers(ipcMain: IpcMain) {
	ipcMain.handle(ValidChannel.GAME_RUNNING, async () => {
		return isGameRunning();
	});

	ipcMain.handle(ValidChannel.LAUNCH_GAME, async (_event, gameExec: string, workshopID: string | bigint | null, closeOnLaunch: boolean, args: string[]) => {
		return launchGameProcess(gameExec, workshopID, closeOnLaunch, args);
	});

	ipcMain.handle(ValidChannel.PATH_EXISTS, async (_event, targetPath: string, expectedType?: PathType) => {
		return pathExists(targetPath, expectedType);
	});

	ipcMain.handle(ValidChannel.DISCOVER_GAME_EXEC, async () => {
		return discoverGameExecutablePath();
	});

	ipcMain.handle(ValidChannel.SELECT_PATH, async (_event, directory: boolean, title: string) => {
		return selectPath(directory, title);
	});
}

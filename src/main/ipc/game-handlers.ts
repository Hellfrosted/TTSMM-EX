import child_process from 'child_process';
import fs from 'fs';
import os from 'node:os';
import { app, IpcMain, dialog, shell } from 'electron';
import log from 'electron-log';
import path from 'path';
import { z } from 'zod';

import { ModType, PathType, ValidChannel, createModUid } from '../../model';
import { TERRATECH_STEAM_APP_ID } from '../../shared/terratech';
import { expandUserPath } from '../path-utils';
import { findSteamLibraryPaths } from '../steam-library-discovery';
import { registerValidatedIpcHandler } from './ipc-handler';
import { parseIpcPayload } from './ipc-validation';

interface ProcessDetails {
	pid: number;
	ppid: number;
	name: string;
}

const WINDOWS_TERRATECH_EXECUTABLE_PATH = path.join('steamapps', 'common', 'TerraTech', 'TerraTechWin64.exe');

const MAX_LAUNCH_ARGS = 1_000;

const launchGamePayloadSchema = z.object({
	gameExec: z.string(),
	workshopID: z.union([z.string(), z.bigint(), z.null()]),
	closeOnLaunch: z.boolean(),
	args: z.array(z.string()).max(MAX_LAUNCH_ARGS)
});

const pathExistsPayloadSchema = z.object({
	targetPath: z.string(),
	expectedType: z.enum(PathType).optional()
});

const selectPathPayloadSchema = z.object({
	directory: z.boolean(),
	title: z.string()
});

export function parseLaunchGamePayload(
	channel: ValidChannel,
	gameExec: unknown,
	workshopID: unknown,
	closeOnLaunch: unknown,
	args: unknown
) {
	return parseIpcPayload(channel, launchGamePayloadSchema, {
		gameExec,
		workshopID,
		closeOnLaunch,
		args
	});
}

export function parsePathExistsPayload(channel: ValidChannel, targetPath: unknown, expectedType: unknown) {
	return parseIpcPayload(channel, pathExistsPayloadSchema, {
		targetPath,
		expectedType
	});
}

export function parseSelectPathPayload(channel: ValidChannel, directory: unknown, title: unknown) {
	return parseIpcPayload(channel, selectPathPayloadSchema, {
		directory,
		title
	});
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
	registrySteamPath,
	existsSync = fs.existsSync,
	readFileSync = fs.readFileSync
}: DiscoverGameExecutableOptions = {}): string | null {
	if (platform !== 'win32') {
		return null;
	}

	for (const libraryRoot of findSteamLibraryPaths({ env, existsSync, platform, readFileSync, registrySteamPath })) {
		const executablePath = path.join(libraryRoot, WINDOWS_TERRATECH_EXECUTABLE_PATH);
		if (existsSync(executablePath)) {
			return path.normalize(executablePath);
		}
	}

	return null;
}

async function isGameRunning(): Promise<boolean> {
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

function encodeSteamRunArgument(argument: string) {
	return encodeURIComponent(argument).replace(/%2B/gi, '+').replace(/%5B/gi, '[').replace(/%5D/gi, ']').replace(/%3A/gi, ':');
}

export function launchGameProcess(
	gameExec: string,
	workshopID: string | bigint | null | undefined,
	closeOnLaunch: boolean,
	args: string[],
	spawn: typeof child_process.spawn = child_process.spawn,
	openExternal?: typeof shell.openExternal,
	platform: NodeJS.Platform = process.platform,
	quit?: typeof app.quit,
	homeDir: string = os.homedir()
): Promise<boolean> {
	log.info('Launching game with custom args:');
	const allArgs = ['+custom_mod_list', workshopID ? `[${createModUid(ModType.WORKSHOP, workshopID)}]` : '[]', ...args];
	log.info(allArgs);
	const quitApp = quit ?? (() => app.quit());
	const resolvedGameExec = expandUserPath(gameExec, homeDir) ?? gameExec;
	if (platform === 'linux') {
		const steamRunArgs = allArgs.map((argument) => encodeSteamRunArgument(argument)).join(' ');
		const steamRunUrl = `steam://run/${TERRATECH_STEAM_APP_ID}//${steamRunArgs}/`;
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
		const child = spawn(
			platform === 'darwin' && resolvedGameExec.endsWith('.app') ? 'open' : resolvedGameExec,
			platform === 'darwin' && resolvedGameExec.endsWith('.app') ? ['-a', resolvedGameExec, '--args', ...allArgs] : allArgs,
			{
				detached: true
			}
		);
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

async function selectPath(directory: boolean, title: string): Promise<string | null> {
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

export function pathExists(targetPath: string, expectedType?: PathType, homeDir: string = os.homedir()): boolean {
	const normalizedTargetPath = expandUserPath(targetPath, homeDir);
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
	registerValidatedIpcHandler(ipcMain, ValidChannel.GAME_RUNNING, async () => {
		return isGameRunning();
	});

		registerValidatedIpcHandler(
			ipcMain,
			ValidChannel.LAUNCH_GAME,
			async (_event, gameExec: unknown, workshopID: unknown, closeOnLaunch: unknown, args: unknown) => {
				const payload = parseLaunchGamePayload(ValidChannel.LAUNCH_GAME, gameExec, workshopID, closeOnLaunch, args);
				return launchGameProcess(payload.gameExec, payload.workshopID, payload.closeOnLaunch, payload.args);
			}
		);

		registerValidatedIpcHandler(ipcMain, ValidChannel.PATH_EXISTS, async (_event, targetPath: unknown, expectedType?: unknown) => {
			const payload = parsePathExistsPayload(ValidChannel.PATH_EXISTS, targetPath, expectedType);
			return pathExists(payload.targetPath, payload.expectedType);
		});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DISCOVER_GAME_EXEC, async () => {
		return discoverGameExecutablePath();
	});

		registerValidatedIpcHandler(ipcMain, ValidChannel.SELECT_PATH, async (_event, directory: unknown, title: unknown) => {
			const payload = parseSelectPathPayload(ValidChannel.SELECT_PATH, directory, title);
			return selectPath(payload.directory, payload.title);
		});
	}

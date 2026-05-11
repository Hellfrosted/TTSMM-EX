import os from 'node:os';
import child_process from 'child_process';
import { Effect, Schema } from 'effect';
import { app, dialog, IpcMain, shell } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';

import { createModManagerUid, PathType, ValidChannel } from '../../model';
import { TERRATECH_STEAM_APP_ID } from '../../shared/terratech';
import { expandUserPath } from '../path-utils';
import { runMain } from '../runtime';
import { findSteamLibraryPaths } from '../steam-library-discovery';
import { registerValidatedIpcHandler } from './ipc-handler';
import { parseEffectIpcPayload } from './ipc-validation';

interface ProcessDetails {
	pid: number;
	ppid: number;
	name: string;
}

const WINDOWS_TERRATECH_EXECUTABLE_PATH = path.join('steamapps', 'common', 'TerraTech', 'TerraTechWin64.exe');

const MAX_LAUNCH_ARGS = 1_000;

const launchGamePayloadSchema = Schema.Struct({
	gameExec: Schema.String,
	workshopID: Schema.Union([Schema.String, Schema.BigInt, Schema.Null]),
	closeOnLaunch: Schema.Boolean,
	args: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_LAUNCH_ARGS))
});

const pathExistsPayloadSchema = Schema.Struct({
	targetPath: Schema.String,
	expectedType: Schema.optional(Schema.Literals([PathType.FILE, PathType.DIRECTORY]))
});

const selectPathPayloadSchema = Schema.Struct({
	directory: Schema.Boolean,
	title: Schema.String
});

export function parseLaunchGamePayload(
	channel: ValidChannel,
	gameExec: unknown,
	workshopID: unknown,
	closeOnLaunch: unknown,
	args: unknown
) {
	return parseEffectIpcPayload(
		channel,
		launchGamePayloadSchema,
		{
			gameExec,
			workshopID,
			closeOnLaunch,
			args
		},
		{ onExcessProperty: 'ignore' }
	) as { args: string[]; closeOnLaunch: boolean; gameExec: string; workshopID: bigint | null | string };
}

export function parsePathExistsPayload(channel: ValidChannel, targetPath: unknown, expectedType: unknown) {
	return parseEffectIpcPayload(
		channel,
		pathExistsPayloadSchema,
		{
			targetPath,
			expectedType
		},
		{ onExcessProperty: 'ignore' }
	) as { expectedType?: PathType; targetPath: string };
}

export function parseSelectPathPayload(channel: ValidChannel, directory: unknown, title: unknown) {
	return parseEffectIpcPayload(
		channel,
		selectPathPayloadSchema,
		{
			directory,
			title
		},
		{ onExcessProperty: 'ignore' }
	);
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

const isGameRunning = Effect.fnUntraced(function* (): Effect.fn.Return<boolean> {
	const psList = yield* Effect.tryPromise({
		try: () => import('ps-list').then((module) => module.default),
		catch: (error) => error
	}).pipe(
		Effect.catch((error) => {
			log.error('Failed to get game running status. Defaulting to not running');
			log.error(error);
			return Effect.succeed(undefined);
		})
	);
	if (!psList) {
		return false;
	}
	const processes = yield* Effect.tryPromise({
		try: () => psList(),
		catch: (error) => error
	}).pipe(
		Effect.catch((error) => {
			log.error('Failed to get game running status. Defaulting to not running');
			log.error(error);
			return Effect.succeed<ProcessDetails[]>([]);
		})
	);
	const matches = processes.filter((process) => /[Tt]erra[Tt]ech(?!.*[Mm]od)/.test(process.name));
	const running = matches.length > 0;
	if (running) {
		log.debug('Detected TerraTech is running:');
		log.debug(processes.flatMap((process) => (/[Tt]erra[Tt]ech/.test(process.name) ? [process.name] : [])));
	}
	return running;
});

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
): Effect.Effect<boolean> {
	log.info('Launching game with custom args:');
	const allArgs = ['+custom_mod_list', workshopID ? `[${createModManagerUid(workshopID)}]` : '[]', ...args];
	log.info(allArgs);
	const quitApp = quit ?? (() => app.quit());
	const resolvedGameExec = expandUserPath(gameExec, homeDir) ?? gameExec;
	if (platform === 'linux') {
		const steamRunArgs = allArgs.map((argument) => encodeSteamRunArgument(argument)).join(' ');
		const steamRunUrl = `steam://run/${TERRATECH_STEAM_APP_ID}//${steamRunArgs}/`;
		log.info(`Launching game via Steam protocol: ${steamRunUrl}`);
		const launchExternal = openExternal ?? ((url: string) => shell.openExternal(url));
		return Effect.tryPromise({
			try: () => launchExternal(steamRunUrl),
			catch: (error) => error
		}).pipe(
			Effect.map(() => {
				if (closeOnLaunch) {
					quitApp();
				}
				return true;
			}),
			Effect.catch((error) => {
				log.error('Failed to launch game through Steam protocol');
				log.error(error);
				return Effect.succeed(false);
			})
		);
	}
	try {
		const child = spawn(
			platform === 'darwin' && resolvedGameExec.endsWith('.app') ? 'open' : resolvedGameExec,
			platform === 'darwin' && resolvedGameExec.endsWith('.app') ? ['-a', resolvedGameExec, '--args', ...allArgs] : allArgs,
			{
				detached: true
			}
		);
		return Effect.callback<boolean>((resume) => {
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
				resume(Effect.succeed(success));
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
		return Effect.succeed(false);
	}
}

const selectPath = Effect.fnUntraced(function* (directory: boolean, title: string): Effect.fn.Return<string | null> {
	const result = yield* Effect.tryPromise({
		try: () =>
			dialog.showOpenDialog({
				title,
				properties: ['showHiddenFiles', directory ? 'openDirectory' : 'openFile', 'promptToCreate', 'createDirectory']
			}),
		catch: (error) => error
	}).pipe(
		Effect.catch((error) => {
			log.error(error);
			return Effect.succeed(undefined);
		})
	);
	if (!result || result.canceled) {
		return null;
	}
	return result.filePaths[0] || null;
});

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
		return runMain(isGameRunning());
	});

	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.LAUNCH_GAME,
		async (_event, gameExec: unknown, workshopID: unknown, closeOnLaunch: unknown, args: unknown) => {
			const payload = parseLaunchGamePayload(ValidChannel.LAUNCH_GAME, gameExec, workshopID, closeOnLaunch, args);
			return runMain(launchGameProcess(payload.gameExec, payload.workshopID, payload.closeOnLaunch, payload.args));
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
		return runMain(selectPath(payload.directory, payload.title));
	});
}

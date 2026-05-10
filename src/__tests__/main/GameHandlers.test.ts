import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PathType, ValidChannel } from '../../model';
import {
	discoverGameExecutablePath,
	launchGameProcess,
	parseLaunchGamePayload,
	parsePathExistsPayload,
	parseSelectPathPayload,
	pathExists
} from '../../main/ipc/game-handlers';
import { createTempDir } from './test-utils';

describe('game handlers', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-game-test-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('checks path existence by plain path and expected type', () => {
		const directoryPath = path.join(tempDir, 'mods');
		const filePath = path.join(tempDir, 'TerraTechWin64.exe');
		fs.mkdirSync(directoryPath);
		fs.writeFileSync(filePath, 'binary');

		expect(pathExists(directoryPath, PathType.DIRECTORY)).toBe(true);
		expect(pathExists(directoryPath, PathType.FILE)).toBe(false);
		expect(pathExists(filePath, PathType.FILE)).toBe(true);
		expect(pathExists(filePath, PathType.DIRECTORY)).toBe(false);
		expect(pathExists('', PathType.FILE)).toBe(false);
		expect(pathExists('   ', PathType.DIRECTORY)).toBe(false);
		expect(pathExists(path.join(tempDir, 'missing'), PathType.FILE)).toBe(false);
	});

	it('validates game IPC payloads before they reach OS adapters', () => {
		expect(parseLaunchGamePayload(ValidChannel.LAUNCH_GAME, 'game.exe', BigInt(42), true, ['-batchmode'])).toEqual({
			gameExec: 'game.exe',
			workshopID: BigInt(42),
			closeOnLaunch: true,
			args: ['-batchmode']
		});
		expect(parsePathExistsPayload(ValidChannel.PATH_EXISTS, '/tmp/game.exe', PathType.FILE)).toEqual({
			targetPath: '/tmp/game.exe',
			expectedType: PathType.FILE
		});
		expect(parseSelectPathPayload(ValidChannel.SELECT_PATH, true, 'Choose folder')).toEqual({
			directory: true,
			title: 'Choose folder'
		});

		expect(() => parseLaunchGamePayload(ValidChannel.LAUNCH_GAME, 'game.exe', BigInt(42), true, [1])).toThrow(
			'Invalid IPC payload for launch-game'
		);
		expect(() => parsePathExistsPayload(ValidChannel.PATH_EXISTS, '/tmp/game.exe', 'file')).toThrow('Invalid IPC payload for path-exists');
		expect(() => parseSelectPathPayload(ValidChannel.SELECT_PATH, 'yes', 'Choose folder')).toThrow('Invalid IPC payload for select-path');
	});

	it('expands home-relative paths when checking existence', () => {
		const homeDir = path.join(tempDir, 'home');
		const executablePath = path.join(homeDir, 'TerraTechOSX64.app');
		fs.mkdirSync(executablePath, { recursive: true });

		expect(pathExists('~/TerraTechOSX64.app', PathType.DIRECTORY, homeDir)).toBe(true);
	});

	it('discovers the TerraTech executable from Steam libraryfolders', () => {
		const steamRoot = path.join(tempDir, 'Steam');
		const libraryRoot = path.join(tempDir, 'SteamLibrary');
		const libraryFoldersPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
		const executablePath = path.join(libraryRoot, 'steamapps', 'common', 'TerraTech', 'TerraTechWin64.exe');
		const escapedSteamRoot = steamRoot.replaceAll('\\', '\\\\');
		const escapedLibraryRoot = libraryRoot.replaceAll('\\', '\\\\');
		const libraryFoldersContents = [
			'"libraryfolders"',
			'{',
			'\t"0"',
			'\t{',
			`\t\t"path"\t\t"${escapedSteamRoot}"`,
			'\t}',
			'\t"1"',
			'\t{',
			`\t\t"path"\t\t"${escapedLibraryRoot}"`,
			'\t}',
			'}',
			''
		].join('\n');

		fs.mkdirSync(path.dirname(libraryFoldersPath), { recursive: true });
		fs.mkdirSync(path.dirname(executablePath), { recursive: true });
		fs.writeFileSync(libraryFoldersPath, libraryFoldersContents);
		fs.writeFileSync(executablePath, 'binary');

		expect(
			discoverGameExecutablePath({
				platform: 'win32',
				registrySteamPath: steamRoot
			})
		).toBe(path.normalize(executablePath));
	});

	it('returns false when process spawn throws during launch', async () => {
		const spawn = vi.fn(() => {
			throw new Error('spawn failed');
		}) as unknown as typeof child_process.spawn;

		await expect(launchGameProcess('game.exe', BigInt(1), false, ['+foo'], spawn, undefined, 'win32')).resolves.toBe(false);
	});

	it('returns false when process launch fails asynchronously', async () => {
		const onceHandlers = new Map<string, (...args: unknown[]) => void>();
		const spawn = vi.fn(() => ({
			once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				onceHandlers.set(event, handler);
			}),
			removeAllListeners: vi.fn(),
			unref: vi.fn()
		})) as unknown as typeof child_process.spawn;

		const launchPromise = launchGameProcess('game.exe', BigInt(1), false, ['+foo'], spawn, undefined, 'win32');
		onceHandlers.get('error')?.(new Error('spawn async failed'));

		await expect(launchPromise).resolves.toBe(false);
	});

	it('launches macOS app bundles through open after expanding the home directory', async () => {
		const onceHandlers = new Map<string, (...args: unknown[]) => void>();
		const child = {
			once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				onceHandlers.set(event, handler);
			}),
			removeAllListeners: vi.fn(),
			unref: vi.fn()
		};
		const spawn = vi.fn(() => child) as unknown as typeof child_process.spawn;
		const launchPromise = launchGameProcess(
			'~/TerraTechOSX64.app',
			BigInt(1),
			false,
			['+foo'],
			spawn,
			undefined,
			'darwin',
			undefined,
			'/Users/tester'
		);

		expect(spawn).toHaveBeenCalledWith(
			'open',
			['-a', path.join('/Users/tester', 'TerraTechOSX64.app'), '--args', '+custom_mod_list', '[workshop:1]', '+foo'],
			{ detached: true }
		);

		onceHandlers.get('spawn')?.();
		await expect(launchPromise).resolves.toBe(true);
	});

	it('launches through the Steam protocol on linux without quitting when closeOnLaunch is disabled', async () => {
		const spawn = vi.fn() as unknown as typeof child_process.spawn;
		const openExternal = vi.fn(async () => undefined);
		const quit = vi.fn();

		await expect(launchGameProcess('game.exe', BigInt(42), false, ['-batchmode'], spawn, openExternal, 'linux', quit)).resolves.toBe(true);

		expect(spawn).not.toHaveBeenCalled();
		expect(openExternal).toHaveBeenCalledWith('steam://run/285920//+custom_mod_list [workshop:42] -batchmode/');
		expect(quit).not.toHaveBeenCalled();
	});

	it('encodes linux Steam protocol arguments that contain spaces', async () => {
		const spawn = vi.fn() as unknown as typeof child_process.spawn;
		const openExternal = vi.fn(async () => undefined);

		await expect(
			launchGameProcess('game.exe', BigInt(42), false, ['--flag', 'value with space'], spawn, openExternal, 'linux')
		).resolves.toBe(true);

		expect(openExternal).toHaveBeenCalledWith('steam://run/285920//+custom_mod_list [workshop:42] --flag value%20with%20space/');
		expect(spawn).not.toHaveBeenCalled();
	});

	it('encodes linux Steam protocol arguments that contain reserved URL characters', async () => {
		const spawn = vi.fn() as unknown as typeof child_process.spawn;
		const openExternal = vi.fn(async () => undefined);

		await expect(
			launchGameProcess(
				'game.exe',
				BigInt(42),
				false,
				['--url', 'https://example.com/mod?id=1&name=alpha#frag%20value'],
				spawn,
				openExternal,
				'linux'
			)
		).resolves.toBe(true);

		expect(openExternal).toHaveBeenCalledWith(
			'steam://run/285920//+custom_mod_list [workshop:42] --url https:%2F%2Fexample.com%2Fmod%3Fid%3D1%26name%3Dalpha%23frag%2520value/'
		);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('launches through the Steam protocol on linux and quits when closeOnLaunch is enabled', async () => {
		const spawn = vi.fn() as unknown as typeof child_process.spawn;
		const openExternal = vi.fn(async () => undefined);
		const quit = vi.fn();

		await expect(launchGameProcess('game.exe', BigInt(42), true, ['-batchmode'], spawn, openExternal, 'linux', quit)).resolves.toBe(true);

		expect(spawn).not.toHaveBeenCalled();
		expect(openExternal).toHaveBeenCalledWith('steam://run/285920//+custom_mod_list [workshop:42] -batchmode/');
		expect(quit).toHaveBeenCalledTimes(1);
	});

	it('returns false when the linux Steam protocol handoff fails', async () => {
		const openExternal = vi.fn(async () => {
			throw new Error('steam handoff failed');
		});
		const quit = vi.fn();

		await expect(
			launchGameProcess(
				'game.exe',
				BigInt(42),
				false,
				['-batchmode'],
				vi.fn() as unknown as typeof child_process.spawn,
				openExternal,
				'linux',
				quit
			)
		).resolves.toBe(false);

		expect(quit).not.toHaveBeenCalled();
	});
});

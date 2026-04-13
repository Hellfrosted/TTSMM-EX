import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PathType } from '../../model';
import { discoverGameExecutablePath, launchGameProcess, pathExists } from '../../main/ipc/game-handlers';
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

	it('launches through the Steam protocol on linux and always quits after handoff', async () => {
		const spawn = vi.fn() as unknown as typeof child_process.spawn;
		const openExternal = vi.fn(async () => undefined);
		const quit = vi.fn();

		await expect(launchGameProcess('game.exe', BigInt(42), false, ['-batchmode'], spawn, openExternal, 'linux', quit)).resolves.toBe(true);

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
			launchGameProcess('game.exe', BigInt(42), false, ['-batchmode'], vi.fn() as unknown as typeof child_process.spawn, openExternal, 'linux', quit)
		).resolves.toBe(false);

		expect(quit).not.toHaveBeenCalled();
	});
});

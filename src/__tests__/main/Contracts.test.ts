import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('ps-list', () => ({
	default: vi.fn(async () => [])
}));

import Steamworks, { EResult } from '../../main/steamworks';
import { isAllowedExternalUrl } from '../../main/external-links';
import { createDownloadModHandler, createFetchWorkshopDependenciesHandler } from '../../main/ipc/mod-handlers';
import { readConfigFile } from '../../main/ipc/config-handlers';
import { readCollectionFile, renameCollectionFile, updateCollectionFile } from '../../main/ipc/collection-handlers';
import { discoverGameExecutablePath, launchGameProcess, pathExists } from '../../main/ipc/game-handlers';
import ModFetcher from '../../main/mod-fetcher';
import { clearPreviewAllowlist, registerPreviewImage, resolvePreviewImageRequest } from '../../main/preview-protocol';
import { PathType } from '../../model';
import { ValidChannel } from '../../shared/ipc';

describe('main process contracts', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-main-test-'));
		clearPreviewAllowlist();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('downloads mods through ugcDownloadItem', async () => {
		const steamworks = {
			ugcDownloadItem: vi.fn((workshopID: bigint, success: (result: EResult) => void) => {
				expect(workshopID).toBe(BigInt(42));
				success(EResult.k_EResultOK);
			}),
			ugcUnsubscribe: vi.fn()
		};

		const result = await createDownloadModHandler(steamworks as never)({} as never, BigInt(42));

		expect(result).toBe(true);
		expect(steamworks.ugcDownloadItem).toHaveBeenCalledTimes(1);
		expect(steamworks.ugcUnsubscribe).not.toHaveBeenCalled();
	});

	it('publishes workshop dependency lookups as metadata updates', async () => {
		const send = vi.fn();
		const mainWindowProvider = {
			getWebContents: () => ({ send })
		};
		const dependencyLookup = vi.fn(async () => ({
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			}
		}));

		const result = await createFetchWorkshopDependenciesHandler(mainWindowProvider as never, dependencyLookup)({} as never, BigInt(10));

		expect(result).toBe(true);
		expect(dependencyLookup).toHaveBeenCalledWith(BigInt(10));
		expect(send).toHaveBeenCalledWith(ValidChannel.MOD_METADATA_UPDATE, 'workshop:10', {
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			}
		});
	});

	it('returns null for missing config and collection files', () => {
		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toBeNull();
		expect(readCollectionFile(tempDir, 'missing')).toBeNull();
		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(true);
	});

	it('rejects invalid collection names before touching the filesystem', () => {
		expect(updateCollectionFile(tempDir, { name: '..\\..\\escape', mods: [] })).toBe(false);
		expect(readCollectionFile(tempDir, '..\\..\\escape')).toBeNull();
		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(false);
	});

	it('renames collections without dropping the latest in-memory mod selection', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);
		expect(renameCollectionFile(tempDir, { name: 'default', mods: ['local:new'] }, 'renamed')).toBe(true);

		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({
			name: 'renamed',
			mods: ['local:new']
		});
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

	it('skips Linux workshop scans when TerraTech is not installed in Steam', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(false);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([BigInt(1)]);
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('workshop scan should have been skipped');
		});
		const fetcher = new ModFetcher({ send: vi.fn() }, undefined, [], 'linux');

		await expect(fetcher.fetchWorkshopMods()).resolves.toEqual([]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).not.toHaveBeenCalled();
		expect(ugcGetUserItems).not.toHaveBeenCalled();
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
		).toBe(
			path.normalize(executablePath)
		);
	});

	it('allowlists preview images from the current scan only', () => {
		const previewPath = path.join(tempDir, 'KnownMod', 'preview.png');
		fs.mkdirSync(path.dirname(previewPath), { recursive: true });
		fs.writeFileSync(previewPath, 'preview');

		const previewUrl = registerPreviewImage(previewPath);

		expect(resolvePreviewImageRequest(previewUrl)).toBe(path.resolve(previewPath));
		expect(resolvePreviewImageRequest('image://preview/not-registered')).toBeNull();
		expect(resolvePreviewImageRequest(`image://preview/${encodeURIComponent(previewPath)}`)).toBeNull();
	});

	it('keeps the previous preview allowlist alive for one refresh cycle', () => {
		const previewPath = path.join(tempDir, 'KnownMod', 'preview.png');
		const refreshedPreviewPath = path.join(tempDir, 'RefreshedMod', 'preview.png');
		fs.mkdirSync(path.dirname(previewPath), { recursive: true });
		fs.mkdirSync(path.dirname(refreshedPreviewPath), { recursive: true });
		fs.writeFileSync(previewPath, 'preview');
		fs.writeFileSync(refreshedPreviewPath, 'preview');

		const previewUrl = registerPreviewImage(previewPath);
		clearPreviewAllowlist();
		const refreshedPreviewUrl = registerPreviewImage(refreshedPreviewPath);

		expect(resolvePreviewImageRequest(previewUrl)).toBe(path.resolve(previewPath));
		expect(resolvePreviewImageRequest(refreshedPreviewUrl)).toBe(path.resolve(refreshedPreviewPath));

		clearPreviewAllowlist();
		expect(resolvePreviewImageRequest(previewUrl)).toBeNull();
	});

	it('returns false when process spawn throws during launch', async () => {
		const spawn = vi.fn(() => {
			throw new Error('spawn failed');
		});

		await expect(launchGameProcess('game.exe', BigInt(1), false, ['+foo'], spawn as never, undefined, 'win32')).resolves.toBe(false);
	});

	it('returns false when process launch fails asynchronously', async () => {
		const onceHandlers = new Map<string, (...args: unknown[]) => void>();
		const spawn = vi.fn(() => ({
			once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				onceHandlers.set(event, handler);
			}),
			removeAllListeners: vi.fn(),
			unref: vi.fn()
		}));

		const launchPromise = launchGameProcess('game.exe', BigInt(1), false, ['+foo'], spawn as never, undefined, 'win32');
		onceHandlers.get('error')?.(new Error('spawn async failed'));

		await expect(launchPromise).resolves.toBe(false);
	});

	it('launches through the Steam protocol on linux and always quits after handoff', async () => {
		const spawn = vi.fn();
		const openExternal = vi.fn(async () => undefined);
		const quit = vi.fn();

		await expect(
			launchGameProcess('game.exe', BigInt(42), false, ['-batchmode'], spawn as never, openExternal, 'linux', quit)
		).resolves.toBe(true);

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
			launchGameProcess('game.exe', BigInt(42), false, ['-batchmode'], vi.fn() as never, openExternal, 'linux', quit)
		).resolves.toBe(false);

		expect(quit).not.toHaveBeenCalled();
	});

	it('allows only expected external URL protocols and hosts', () => {
		expect(isAllowedExternalUrl('steam://url/CommunityFilePage/123')).toBe(true);
		expect(isAllowedExternalUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=123')).toBe(true);
		expect(isAllowedExternalUrl('https://github.com/Hellfrosted/terratech-steam-mod-loader/issues')).toBe(true);
		expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
		expect(isAllowedExternalUrl('https://example.com')).toBe(false);
	});
});

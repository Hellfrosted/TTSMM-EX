import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSteamAppIdFile, resolveSteamAppIdFilePath } from '../../main/window';
import { createTempDir } from './test-utils';

describe('window helpers', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-window-test-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('resolves the packaged steam_appid.txt beside the executable', () => {
		const exePath = path.join(tempDir, 'TerraTechSteamModManagerEX.exe');

		expect(resolveSteamAppIdFilePath({ isPackaged: true, exePath })).toBe(path.join(tempDir, 'steam_appid.txt'));
	});

	it('writes steam_appid.txt beside the packaged executable', () => {
		const exePath = path.join(tempDir, 'TerraTechSteamModManagerEX.exe');
		const steamAppIdPath = path.join(tempDir, 'steam_appid.txt');

		expect(ensureSteamAppIdFile({ isPackaged: true, exePath })).toBe(true);
		expect(fs.readFileSync(steamAppIdPath, 'utf8')).toBe('285920\n');
	});

	it('rewrites malformed steam_appid.txt contents instead of accepting a prefix match', () => {
		const exePath = path.join(tempDir, 'TerraTechSteamModManagerEX.exe');
		const steamAppIdPath = path.join(tempDir, 'steam_appid.txt');
		fs.writeFileSync(steamAppIdPath, '285920 junk', 'utf8');

		expect(ensureSteamAppIdFile({ isPackaged: true, exePath })).toBe(true);
		expect(fs.readFileSync(steamAppIdPath, 'utf8')).toBe('285920\n');
	});

	it('returns false instead of throwing when steam_appid.txt cannot be written', () => {
		const logger = {
			error: vi.fn()
		};
		const fsImpl = {
			existsSync: vi.fn(() => false),
			readFileSync: vi.fn(),
			writeFileSync: vi.fn(() => {
				throw new Error('permission denied');
			})
		};

		expect(
			ensureSteamAppIdFile({
				isPackaged: true,
				exePath: path.join(tempDir, 'TerraTechSteamModManagerEX.exe'),
				fsImpl,
				logger
			})
		).toBe(false);
		expect(logger.error).toHaveBeenCalled();
	});
});

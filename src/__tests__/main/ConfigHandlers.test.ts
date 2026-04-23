import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { readConfigFile, writeConfigFile } from '../../main/ipc/config-handlers';
import { createTempDir } from './test-utils';

describe('config handlers', () => {
	it('returns null for a missing config file', () => {
		const tempDir = createTempDir('ttsmm-config-test-');

		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toBeNull();
	});

	it('throws when the config file exists but contains malformed json', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		fs.writeFileSync(configPath, '{ bad json', 'utf8');

		expect(() => readConfigFile(configPath, true)).toThrow(`Failed to load config file "${configPath}"`);
	});

	it('drops the removed Nuterra legacy matching flag at the config boundary', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				closeOnLaunch: false,
				language: 'en',
				gameExec: 'TerraTech.exe',
				workshopID: '1',
				logsDir: tempDir,
				steamMaxConcurrency: 1,
				currentPath: '/collections/main',
				viewConfigs: {},
				ignoredValidationErrors: {},
				userOverrides: {},
				treatNuterraSteamBetaAsEquivalent: false
			}),
			'utf8'
		);

		const config = readConfigFile(configPath, true);
		expect(config).not.toBeNull();
		expect(config).not.toHaveProperty('treatNuterraSteamBetaAsEquivalent');
	});

	it('keeps the original config when replacing an existing config fails', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		fs.writeFileSync(configPath, JSON.stringify({ gameExec: 'old.exe', workshopID: '1', ignoredValidationErrors: {}, userOverrides: {}, viewConfigs: {} }), 'utf8');

		const originalRenameSync = fs.renameSync;
		const renameSyncSpy = vi.spyOn(fs, 'renameSync').mockImplementation(((oldPath, newPath) => {
			if (String(oldPath).endsWith('.tmp') && String(newPath) === configPath) {
				throw new Error('rename failed');
			}

			return originalRenameSync(oldPath, newPath);
		}) as typeof fs.renameSync);

		const writeSuccess = writeConfigFile(configPath, {
			closeOnLaunch: false,
			language: 'en',
			gameExec: 'new.exe',
			workshopID: BigInt(1),
			logsDir: tempDir,
			steamMaxConcurrency: 1,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		});

		expect(writeSuccess).toBe(false);
		expect(readConfigFile(configPath, true)).toEqual(
			expect.objectContaining({
				gameExec: 'old.exe'
			})
		);

		renameSyncSpy.mockRestore();
	});
});

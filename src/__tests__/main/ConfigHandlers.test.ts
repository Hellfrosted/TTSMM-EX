import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { readConfigFile, registerConfigHandlers, writeConfigFile } from '../../main/ipc/config-handlers';
import type { AppConfig } from '../../model';
import { ValidChannel } from '../../shared/ipc';
import { createTempDir, createValidIpcEvent } from './test-utils';

function createConfigHandlerHarness(userDataPath: string) {
	const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
	const ipcMain = {
		handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
			handlers.set(channel, handler);
		}),
		on: vi.fn()
	};

	registerConfigHandlers(ipcMain as never, true, {
		getUserDataPath: () => userDataPath
	});

	const invoke = <T>(channel: ValidChannel, ...args: unknown[]) => {
		const handler = handlers.get(channel);
		if (!handler) {
			throw new Error(`Missing handler for ${channel}`);
		}
		return handler(createValidIpcEvent(), ...args) as Promise<T>;
	};

	const invokeWithEvent = <T>(channel: ValidChannel, event: unknown, ...args: unknown[]) => {
		const handler = handlers.get(channel);
		if (!handler) {
			throw new Error(`Missing handler for ${channel}`);
		}
		return handler(event, ...args) as Promise<T>;
	};

	return { invoke, invokeWithEvent };
}

function createValidConfig(overrides: Partial<AppConfig> = {}): AppConfig {
	return {
		closeOnLaunch: false,
		language: 'en',
		gameExec: 'TerraTech.exe',
		workshopID: BigInt(1),
		logsDir: 'logs',
		steamMaxConcurrency: 1,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map(),
		...overrides
	};
}

describe('config handlers', () => {
	it('returns null for a missing config file', () => {
		const tempDir = createTempDir('ttsmm-config-test-');

		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toBeNull();
	});

	it('rejects read calls from unexpected IPC senders', async () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const { invokeWithEvent } = createConfigHandlerHarness(tempDir);

		await expect(
			invokeWithEvent(ValidChannel.READ_CONFIG, {
				senderFrame: {
					url: 'https://example.com/index.html'
				}
			})
		).rejects.toThrow('Rejected IPC sender for read-config');
	});

	it('rejects write calls before parsing payloads or writing config files', async () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const { invokeWithEvent } = createConfigHandlerHarness(tempDir);

		await expect(invokeWithEvent(ValidChannel.UPDATE_CONFIG, { senderFrame: null }, { gameExec: 42 })).rejects.toThrow(
			'Rejected IPC sender for update-config'
		);
		expect(fs.existsSync(path.join(tempDir, 'config.json'))).toBe(false);
	});

	it('throws when the config file exists but contains malformed json', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		fs.writeFileSync(configPath, '{ bad json', 'utf8');

		expect(() => readConfigFile(configPath, true)).toThrow(`Failed to load config file "${configPath}"`);
	});

	it('strips obsolete persisted config fields when loading older config files', () => {
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
		fs.writeFileSync(
			configPath,
			JSON.stringify({ gameExec: 'old.exe', workshopID: '1', ignoredValidationErrors: {}, userOverrides: {}, viewConfigs: {} }),
			'utf8'
		);

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

	it('rejects malformed update payloads at the ipc seam', async () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const { invoke } = createConfigHandlerHarness(tempDir);

		await expect(invoke(ValidChannel.UPDATE_CONFIG, createValidConfig({ workshopID: '1' as never }))).rejects.toThrow(
			'Invalid IPC payload for update-config'
		);
		await expect(invoke(ValidChannel.UPDATE_CONFIG, { ...createValidConfig(), ignoredValidationErrors: {} })).rejects.toThrow(
			'Invalid IPC payload for update-config'
		);

		expect(fs.existsSync(path.join(tempDir, 'config.json'))).toBe(false);
	});

	it('accepts valid update payloads through the ipc seam', async () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const { invoke } = createConfigHandlerHarness(tempDir);

		await expect(invoke(ValidChannel.UPDATE_CONFIG, createValidConfig({ gameExec: 'new.exe' }))).resolves.toBe(true);

		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toEqual(
			expect.objectContaining({
				gameExec: 'new.exe',
				workshopID: BigInt(1)
			})
		);
	});
});

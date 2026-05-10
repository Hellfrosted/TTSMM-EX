import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { readConfigFile, writeConfigFile } from '../../main/config-store';
import { registerConfigHandlers } from '../../main/ipc/config-handlers';
import { ModErrorType, type AppConfig } from '../../model';
import { createDefaultAppConfig } from '../../shared/app-config-defaults';
import { ValidChannel } from '../../shared/ipc';
import { createIpcHandlerHarness, createTempDir } from './test-utils';

function createConfigHandlerHarness(userDataPath: string) {
	return createIpcHandlerHarness((ipcMain) =>
		registerConfigHandlers(ipcMain, true, {
			getUserDataPath: () => userDataPath
		})
	);
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
		treatNuterraSteamBetaAsEquivalent: true,
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

	it('defaults NuterraSteam compatibility on when loading older config files', () => {
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
				userOverrides: {}
			}),
			'utf8'
		);

		const config = readConfigFile(configPath, true);
		expect(config).not.toBeNull();
		expect(config?.treatNuterraSteamBetaAsEquivalent).toBe(true);
	});

	it('fills missing config defaults when loading older config files', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				gameExec: 'TerraTech.exe',
				workshopID: '1'
			}),
			'utf8'
		);

		const config = readConfigFile(configPath, true);
		expect(config).toEqual(
			expect.objectContaining({
				closeOnLaunch: false,
				currentPath: '/collections/main',
				gameExec: 'TerraTech.exe',
				language: 'english',
				logsDir: '',
				steamMaxConcurrency: 5,
				treatNuterraSteamBetaAsEquivalent: true,
				viewConfigs: {},
				workshopID: BigInt(1)
			})
		);
		expect(config?.ignoredValidationErrors).toBeInstanceOf(Map);
		expect(config?.userOverrides).toBeInstanceOf(Map);
	});

	it('repairs malformed persisted config fields at the app config boundary', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		const defaultConfig = createDefaultAppConfig(process.platform);
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				activeCollection: '',
				closeOnLaunch: 'yes',
				currentPath: '/loading/mods',
				gameExec: 42,
				ignoredValidationErrors: {
					[ModErrorType.INVALID_ID]: {
						'local:broken': ['BrokenId', 123],
						'local:empty': []
					},
					notAnErrorType: {
						'local:ignored': ['Ignored']
					}
				},
				localDir: 42,
				logParams: {
					Core: 'debug',
					Bad: 'verbose'
				},
				logLevel: 'trace',
				pureVanilla: 'false',
				userOverrides: {
					'local:override': {
						id: 'OverrideId',
						tags: ['utility', 7]
					},
					'local:empty': {}
				},
				viewConfigs: {
					blockLookup: {
						columnActiveConfig: {
							blockName: false,
							Legacy: false
						},
						columnOrder: ['Legacy', 'blockName', 'blockName', 'preview'],
						columnWidthConfig: {
							blockName: 10,
							modTitle: 177,
							preview: 92,
							Legacy: 999
						},
						smallRows: true
					},
					main: {
						columnActiveConfig: {
							Name: false,
							ID: false,
							Legacy: false
						},
						columnOrder: ['Legacy', 'ID', 'ID', 'Name'],
						columnWidthConfig: {
							Name: 288,
							ID: 10,
							'Workshop Update': 10,
							Legacy: 999
						},
						detailsOverlayHeight: 99,
						detailsOverlayWidth: 111,
						smallRows: 'yes'
					},
					unknown: { ignored: true }
				},
				workshopID: '0'
			}),
			'utf8'
		);

		expect(readConfigFile(configPath, true)).toEqual(
			expect.objectContaining({
				activeCollection: undefined,
				closeOnLaunch: false,
				currentPath: '/collections/main',
				gameExec: defaultConfig.gameExec,
				ignoredValidationErrors: new Map([[ModErrorType.INVALID_ID, { 'local:broken': ['BrokenId'] }]]),
				localDir: undefined,
				logParams: { Core: 'debug' },
				logLevel: undefined,
				pureVanilla: undefined,
				userOverrides: new Map([['local:override', { id: 'OverrideId', tags: ['utility'] }]]),
				viewConfigs: {
					blockLookup: {
						columnActiveConfig: {
							blockName: false
						},
						columnOrder: ['blockName', 'preview'],
						columnWidthConfig: {
							blockName: 96,
							modTitle: 177
						},
						smallRows: true
					},
					main: {
						columnActiveConfig: {
							ID: false
						},
						columnOrder: ['ID', 'Name'],
						columnWidthConfig: {
							ID: 50,
							'Workshop Update': 154
						},
						detailsOverlayHeight: 220,
						detailsOverlayWidth: 360
					}
				},
				workshopID: BigInt(2790161231)
			})
		);
	});

	it('preserves explicit NuterraSteam compatibility opt-out when loading config files', () => {
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
		expect(config?.treatNuterraSteamBetaAsEquivalent).toBe(false);
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

		expect(writeSuccess).toBeNull();
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

		await expect(invoke(ValidChannel.UPDATE_CONFIG, createValidConfig({ gameExec: 'new.exe' }))).resolves.toEqual(
			expect.objectContaining({
				gameExec: 'new.exe',
				workshopID: BigInt(1)
			})
		);

		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toEqual(
			expect.objectContaining({
				gameExec: 'new.exe',
				workshopID: BigInt(1)
			})
		);
	});

	it('keeps config storage as the json adapter while shared defaults restore runtime types', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');

		expect(
			writeConfigFile(
				configPath,
				createValidConfig({
					ignoredValidationErrors: new Map([[ModErrorType.INVALID_ID, { 'local:broken': ['Invalid mod ID'] }]]),
					userOverrides: new Map([['local:override', { id: 'OverrideId', tags: ['utility'] }]])
				})
			)
		).toEqual(
			expect.objectContaining({
				workshopID: BigInt(1),
				ignoredValidationErrors: new Map([[ModErrorType.INVALID_ID, { 'local:broken': ['Invalid mod ID'] }]]),
				userOverrides: new Map([['local:override', { id: 'OverrideId', tags: ['utility'] }]])
			})
		);

		expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual(
			expect.objectContaining({
				workshopID: '1',
				ignoredValidationErrors: {
					[ModErrorType.INVALID_ID]: {
						'local:broken': ['Invalid mod ID']
					}
				},
				userOverrides: {
					'local:override': {
						id: 'OverrideId',
						tags: ['utility']
					}
				}
			})
		);

		expect(readConfigFile(configPath, true)).toEqual(
			expect.objectContaining({
				workshopID: BigInt(1),
				ignoredValidationErrors: new Map([[ModErrorType.INVALID_ID, { 'local:broken': ['Invalid mod ID'] }]]),
				userOverrides: new Map([['local:override', { id: 'OverrideId', tags: ['utility'] }]])
			})
		);
	});
});

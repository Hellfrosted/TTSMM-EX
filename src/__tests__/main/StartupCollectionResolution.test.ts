import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig, ModCollection } from '../../model';
import { updateCollectionFile, readCollectionFile } from '../../main/collection-store';
import { readConfigFile } from '../../main/config-store';
import { resolveStartupCollection } from '../../main/startup-collection-resolution';
import { createTempDir } from './test-utils';

function config(activeCollection?: string): AppConfig {
	return {
		closeOnLaunch: false,
		language: 'english',
		gameExec: '',
		workshopID: BigInt(0),
		logsDir: '',
		activeCollection,
		steamMaxConcurrency: 5,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map()
	};
}

function writeCollection(userDataPath: string, collection: ModCollection) {
	expect(updateCollectionFile(userDataPath, collection)).toBe(true);
}

describe('startup collection resolution', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-startup-collection-resolution-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('keeps a valid Active Collection without rewriting persisted shapes', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:a'] });
		writeCollection(tempDir, { name: 'other', mods: [] });

		const result = resolveStartupCollection(tempDir, config('default'));

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.activeCollection).toEqual({ name: 'default', mods: ['local:a'] });
		expect(result.collectionNames).toEqual(['default', 'other']);
		expect(result.config.activeCollection).toBe('default');
		expect(fs.existsSync(path.join(tempDir, 'config.json'))).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:a'] });
	});

	it('selects the first saved fallback when the configured Active Collection is missing', () => {
		writeCollection(tempDir, { name: 'zeta', mods: [] });
		writeCollection(tempDir, { name: 'alpha', mods: ['local:a'] });

		const result = resolveStartupCollection(tempDir, config('missing'));

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.activeCollection).toEqual({ name: 'alpha', mods: ['local:a'] });
		expect(result.collectionNames).toEqual(['alpha', 'zeta']);
		expect(result.config.activeCollection).toBe('alpha');
		expect(readConfigFile(path.join(tempDir, 'config.json'), true)?.activeCollection).toBe('alpha');
	});

	it('creates and activates the default collection when none exist', () => {
		const result = resolveStartupCollection(tempDir, config());

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.activeCollection).toEqual({ name: 'default', mods: [] });
		expect(result.collections).toEqual([{ name: 'default', mods: [] }]);
		expect(result.config.activeCollection).toBe('default');
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: [] });
		expect(readConfigFile(path.join(tempDir, 'config.json'), true)?.activeCollection).toBe('default');
	});

	it('returns a user-safe failure when config persistence fails during fallback selection', () => {
		writeCollection(tempDir, { name: 'alpha', mods: [] });
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });

		const result = resolveStartupCollection(tempDir, config('missing'));

		expect(result).toMatchObject({
			ok: false,
			code: 'config-write-failed',
			message: 'Failed to persist repaired active collection alpha'
		});
	});

	it('rolls back the default collection when default activation fails', () => {
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });

		const result = resolveStartupCollection(tempDir, config());

		expect(result).toMatchObject({
			ok: false,
			code: 'config-write-failed',
			message: 'Failed to persist the default active collection during boot'
		});
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
	});
});

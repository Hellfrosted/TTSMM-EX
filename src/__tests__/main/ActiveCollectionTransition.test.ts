import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig, ModCollection } from '../../model';
import {
	createActiveCollectionTransition,
	deleteActiveCollectionTransition,
	renameActiveCollectionTransition,
	resolveStartupActiveCollectionTransition,
	switchActiveCollectionTransition
} from '../../main/active-collection-transition';
import { readCollectionFile, updateCollectionFile } from '../../main/collection-store';
import { readConfigFile } from '../../main/config-store';
import { createTempDir } from './test-utils';

function config(activeCollection = 'default'): AppConfig {
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

describe('active collection transition', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-active-collection-transition-test-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('creates and activates a collection while preserving a dirty active collection draft', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:old'] });

		const result = createActiveCollectionTransition(tempDir, {
			config: config(),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			collection: { name: 'fresh', mods: ['local:new'] }
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.activeCollection).toEqual({ name: 'fresh', mods: ['local:new'] });
		expect(result.collectionNames.sort()).toEqual(['default', 'fresh']);
		expect(result.config.activeCollection).toBe('fresh');
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:dirty'] });
		expect(readConfigFile(path.join(tempDir, 'config.json'), true)?.activeCollection).toBe('fresh');
	});

	it('rolls back a created collection when activation config persistence fails', () => {
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });

		const result = createActiveCollectionTransition(tempDir, {
			config: config(),
			collection: { name: 'fresh', mods: [] }
		});

		expect(result).toMatchObject({
			ok: false,
			code: 'config-write-failed'
		});
		expect(readCollectionFile(tempDir, 'fresh')).toBeNull();
		const configPath = path.join(tempDir, 'config.json');
		expect(fs.statSync(configPath).isFile()).toBe(true);
		expect(readConfigFile(configPath, true)?.activeCollection).toBe('default');
	});

	it('switches active collections after saving dirty edits', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:old'] });
		writeCollection(tempDir, { name: 'alt', mods: ['local:alt'] });

		const result = switchActiveCollectionTransition(tempDir, {
			config: config('default'),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			name: 'alt'
		});

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:dirty'] });
		if (result.ok) {
			expect(result.activeCollection).toEqual({ name: 'alt', mods: ['local:alt'] });
			expect(result.config.activeCollection).toBe('alt');
		}
	});

	it('rejects a switch to a missing collection target', () => {
		const result = switchActiveCollectionTransition(tempDir, {
			config: config('default'),
			name: 'missing'
		});

		expect(result).toMatchObject({
			ok: false,
			code: 'missing-target-collection'
		});
	});

	it('renames and activates an active collection with rollback on activation failure', () => {
		const activeCollection = { name: 'default', mods: ['local:old'] };
		writeCollection(tempDir, activeCollection);

		const result = renameActiveCollectionTransition(tempDir, {
			config: config(),
			activeCollection,
			name: 'renamed'
		});

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({ name: 'renamed', mods: ['local:old'] });
		if (result.ok) {
			expect(result.config.activeCollection).toBe('renamed');
		}

		fs.rmSync(path.join(tempDir, 'config.json'), { force: true });
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });
		const rollbackResult = renameActiveCollectionTransition(tempDir, {
			config: config('renamed'),
			activeCollection: { name: 'renamed', mods: ['local:old'] },
			name: 'rolled-back'
		});

		expect(rollbackResult).toMatchObject({
			ok: false,
			code: 'config-write-failed'
		});
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({ name: 'renamed', mods: ['local:old'] });
		expect(readCollectionFile(tempDir, 'rolled-back')).toBeNull();
		const configPath = path.join(tempDir, 'config.json');
		expect(fs.statSync(configPath).isFile()).toBe(true);
		expect(readConfigFile(configPath, true)?.activeCollection).toBe('renamed');
	});

	it('deletes an active collection and activates the replacement or fallback', () => {
		const activeCollection = { name: 'default', mods: [] };
		writeCollection(tempDir, activeCollection);
		writeCollection(tempDir, { name: 'archived', mods: ['local:a'] });

		const result = deleteActiveCollectionTransition(tempDir, {
			config: config('default'),
			activeCollection
		});

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		if (result.ok) {
			expect(result.activeCollection).toEqual({ name: 'archived', mods: ['local:a'] });
		}

		const fallbackResult = deleteActiveCollectionTransition(tempDir, {
			config: config('archived'),
			activeCollection: { name: 'archived', mods: ['local:a'] }
		});

		expect(fallbackResult.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'archived')).toBeNull();
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: [] });
	});

	it('restores a deleted active collection when replacement selection fails', () => {
		const activeCollection = { name: 'default', mods: ['local:active'] };
		writeCollection(tempDir, activeCollection);
		fs.writeFileSync(path.join(tempDir, 'collections', 'broken.json'), '{', 'utf8');

		const result = deleteActiveCollectionTransition(tempDir, {
			config: config('default'),
			activeCollection
		});

		expect(result).toMatchObject({
			ok: false,
			code: 'missing-target-collection'
		});
		expect(readCollectionFile(tempDir, 'default')).toEqual(activeCollection);
	});

	it('restores a deleted active collection when fallback creation fails', () => {
		const activeCollection = { name: 'active', mods: ['local:active'] };
		writeCollection(tempDir, activeCollection);
		fs.mkdirSync(path.join(tempDir, 'collections', 'default.json'), { recursive: true });

		const result = deleteActiveCollectionTransition(tempDir, {
			config: config('active'),
			activeCollection
		});

		expect(result).toMatchObject({
			ok: false,
			code: 'collection-write-failed'
		});
		expect(readCollectionFile(tempDir, 'active')).toEqual(activeCollection);
		expect(fs.existsSync(path.join(tempDir, 'collections', 'default.json'))).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
	});

	it('resolves startup repair through the active collection transition', () => {
		writeCollection(tempDir, { name: 'zeta', mods: [] });
		writeCollection(tempDir, { name: 'alpha', mods: ['local:a'] });

		const result = resolveStartupActiveCollectionTransition(tempDir, {
			config: config('missing')
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.activeCollection).toEqual({ name: 'alpha', mods: ['local:a'] });
		expect(result.collectionNames).toEqual(['alpha', 'zeta']);
		expect(result.config.activeCollection).toBe('alpha');
		expect(readConfigFile(path.join(tempDir, 'config.json'), true)?.activeCollection).toBe('alpha');
	});
});

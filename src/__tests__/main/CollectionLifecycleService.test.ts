import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig, ModCollection } from '../../model';
import {
	createAndActivateCollection,
	deleteActiveCollection,
	duplicateAndActivateCollection,
	renameActiveCollection,
	runCollectionLifecycle,
	switchActiveCollection
} from '../../main/collection-lifecycle-service';
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

describe('collection lifecycle service', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-collection-lifecycle-test-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('creates and activates a new collection while preserving dirty active edits', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:old'] });

		const result = runCollectionLifecycle(tempDir, {
			type: 'create',
			request: {
				config: config(),
				dirtyCollection: { name: 'default', mods: ['local:dirty'] },
				name: 'fresh',
				mods: ['local:new']
			}
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

	it('rejects invalid and duplicate collection names before writing', () => {
		writeCollection(tempDir, { name: 'default', mods: [] });

		expect(createAndActivateCollection(tempDir, { config: config(), name: '..\\escape' })).toMatchObject({
			ok: false,
			code: 'invalid-name'
		});
		expect(createAndActivateCollection(tempDir, { config: config(), name: 'default' })).toMatchObject({
			ok: false,
			code: 'duplicate-name'
		});
		expect(createAndActivateCollection(tempDir, { config: config(), name: 'Default' })).toMatchObject({
			ok: false,
			code: 'duplicate-name'
		});
		expect(readCollectionFile(tempDir, '..\\escape')).toBeNull();
	});

	it('duplicates and activates the active collection with the dirty mod selection', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:old'] });

		const result = duplicateAndActivateCollection(tempDir, {
			config: config(),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			name: 'copy'
		});

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'copy')).toEqual({ name: 'copy', mods: ['local:dirty'] });
		if (result.ok) {
			expect(result.config.activeCollection).toBe('copy');
		}
	});

	it('renames the active collection and rejects duplicate targets', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:old'] });
		writeCollection(tempDir, { name: 'existing', mods: [] });

		expect(renameActiveCollection(tempDir, { config: config(), name: 'existing' })).toMatchObject({
			ok: false,
			code: 'duplicate-name'
		});

		const result = renameActiveCollection(tempDir, {
			config: config(),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			name: 'renamed'
		});

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({ name: 'renamed', mods: ['local:dirty'] });
	});

	it('deletes the active collection and selects a replacement or fallback', () => {
		writeCollection(tempDir, { name: 'default', mods: [] });
		writeCollection(tempDir, { name: 'archived', mods: ['local:a'] });

		const result = deleteActiveCollection(tempDir, { config: config('default') });

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		if (result.ok) {
			expect(result.activeCollection).toEqual({ name: 'archived', mods: ['local:a'] });
		}

		const fallbackResult = deleteActiveCollection(tempDir, { config: config('archived') });

		expect(fallbackResult.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'archived')).toBeNull();
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: [] });
		if (fallbackResult.ok) {
			expect(fallbackResult.activeCollection.name).toBe('default');
		}
	});

	it('switches active collections after saving dirty edits', () => {
		writeCollection(tempDir, { name: 'default', mods: ['local:old'] });
		writeCollection(tempDir, { name: 'alt', mods: ['local:alt'] });

		const result = switchActiveCollection(tempDir, {
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
});

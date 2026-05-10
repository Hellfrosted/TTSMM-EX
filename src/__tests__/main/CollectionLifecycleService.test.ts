import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	createAndActivateCollection,
	deleteActiveCollection,
	duplicateAndActivateCollection,
	renameActiveCollection,
	runCollectionLifecycle,
	switchActiveCollection
} from '../../main/collection-lifecycle-service';
import { readCollectionFile } from '../../main/collection-store';
import { readConfigFile } from '../../main/config-store';
import { createTempDir, createTestAppConfig, writeTestCollection } from './test-utils';

describe('collection lifecycle service', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-collection-lifecycle-test-');
	});

	it('creates and activates a new collection while preserving dirty active edits', () => {
		writeTestCollection(tempDir, { name: 'default', mods: ['local:old'] });

		const result = runCollectionLifecycle(tempDir, {
			type: 'create',
			request: {
				config: createTestAppConfig(),
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
		writeTestCollection(tempDir, { name: 'default', mods: [] });

		expect(createAndActivateCollection(tempDir, { config: createTestAppConfig(), name: '..\\escape' })).toMatchObject({
			ok: false,
			code: 'invalid-name'
		});
		expect(createAndActivateCollection(tempDir, { config: createTestAppConfig(), name: 'default' })).toMatchObject({
			ok: false,
			code: 'duplicate-name'
		});
		expect(createAndActivateCollection(tempDir, { config: createTestAppConfig(), name: 'Default' })).toMatchObject({
			ok: false,
			code: 'duplicate-name'
		});
		expect(readCollectionFile(tempDir, '..\\escape')).toBeNull();
	});

	it('duplicates and activates the active collection with the dirty mod selection', () => {
		writeTestCollection(tempDir, { name: 'default', mods: ['local:old'] });

		const result = duplicateAndActivateCollection(tempDir, {
			config: createTestAppConfig(),
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
		writeTestCollection(tempDir, { name: 'default', mods: ['local:old'] });
		writeTestCollection(tempDir, { name: 'existing', mods: [] });

		expect(renameActiveCollection(tempDir, { config: createTestAppConfig(), name: 'existing' })).toMatchObject({
			ok: false,
			code: 'duplicate-name'
		});

		const result = renameActiveCollection(tempDir, {
			config: createTestAppConfig(),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			name: 'renamed'
		});

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({ name: 'renamed', mods: ['local:dirty'] });
	});

	it('deletes the active collection and selects a replacement or fallback', () => {
		writeTestCollection(tempDir, { name: 'default', mods: [] });
		writeTestCollection(tempDir, { name: 'archived', mods: ['local:a'] });

		const result = deleteActiveCollection(tempDir, { config: createTestAppConfig({ activeCollection: 'default' }) });

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		if (result.ok) {
			expect(result.activeCollection).toEqual({ name: 'archived', mods: ['local:a'] });
		}

		const fallbackResult = deleteActiveCollection(tempDir, { config: createTestAppConfig({ activeCollection: 'archived' }) });

		expect(fallbackResult.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'archived')).toBeNull();
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: [] });
		if (fallbackResult.ok) {
			expect(fallbackResult.activeCollection.name).toBe('default');
		}
	});

	it('switches active collections after saving dirty edits', () => {
		writeTestCollection(tempDir, { name: 'default', mods: ['local:old'] });
		writeTestCollection(tempDir, { name: 'alt', mods: ['local:alt'] });

		const result = switchActiveCollection(tempDir, {
			config: createTestAppConfig({ activeCollection: 'default' }),
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

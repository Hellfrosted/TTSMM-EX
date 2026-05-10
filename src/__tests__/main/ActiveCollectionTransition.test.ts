import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import {
	createActiveCollectionTransition,
	deleteActiveCollectionTransition,
	renameActiveCollectionTransition,
	resolveStartupActiveCollectionTransition,
	switchActiveCollectionTransition
} from '../../main/active-collection-transition';
import { readCollectionFile } from '../../main/collection-store';
import { readConfigFile } from '../../main/config-store';
import { createTempDir, createTestAppConfig, writeTestCollection } from './test-utils';

describe('active collection transition', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-active-collection-transition-test-');
	});

	it('creates and activates a collection while preserving a dirty active collection draft', () => {
		writeTestCollection(tempDir, { name: 'default', mods: ['local:old'] });

		const result = Effect.runSync(
			createActiveCollectionTransition(tempDir, {
				config: createTestAppConfig(),
				dirtyCollection: { name: 'default', mods: ['local:dirty'] },
				collection: { name: 'fresh', mods: ['local:new'] }
			})
		);

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

		const result = Effect.runSync(
			createActiveCollectionTransition(tempDir, {
				config: createTestAppConfig(),
				collection: { name: 'fresh', mods: [] }
			})
		);

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
		writeTestCollection(tempDir, { name: 'default', mods: ['local:old'] });
		writeTestCollection(tempDir, { name: 'alt', mods: ['local:alt'] });

		const result = Effect.runSync(
			switchActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'default' }),
				dirtyCollection: { name: 'default', mods: ['local:dirty'] },
				name: 'alt'
			})
		);

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:dirty'] });
		if (result.ok) {
			expect(result.activeCollection).toEqual({ name: 'alt', mods: ['local:alt'] });
			expect(result.config.activeCollection).toBe('alt');
		}
	});

	it('rejects a switch to a missing collection target', () => {
		const result = Effect.runSync(
			switchActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'default' }),
				name: 'missing'
			})
		);

		expect(result).toMatchObject({
			ok: false,
			code: 'missing-target-collection'
		});
	});

	it('renames and activates an active collection with rollback on activation failure', () => {
		const activeCollection = { name: 'default', mods: ['local:old'] };
		writeTestCollection(tempDir, activeCollection);

		const result = Effect.runSync(
			renameActiveCollectionTransition(tempDir, {
				config: createTestAppConfig(),
				activeCollection,
				name: 'renamed'
			})
		);

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({ name: 'renamed', mods: ['local:old'] });
		if (result.ok) {
			expect(result.config.activeCollection).toBe('renamed');
		}

		fs.rmSync(path.join(tempDir, 'config.json'), { force: true });
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });
		const rollbackResult = Effect.runSync(
			renameActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'renamed' }),
				activeCollection: { name: 'renamed', mods: ['local:old'] },
				name: 'rolled-back'
			})
		);

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
		writeTestCollection(tempDir, activeCollection);
		writeTestCollection(tempDir, { name: 'archived', mods: ['local:a'] });

		const result = Effect.runSync(
			deleteActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'default' }),
				activeCollection
			})
		);

		expect(result.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		if (result.ok) {
			expect(result.activeCollection).toEqual({ name: 'archived', mods: ['local:a'] });
		}

		const fallbackResult = Effect.runSync(
			deleteActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'archived' }),
				activeCollection: { name: 'archived', mods: ['local:a'] }
			})
		);

		expect(fallbackResult.ok).toBe(true);
		expect(readCollectionFile(tempDir, 'archived')).toBeNull();
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: [] });
	});

	it('restores a deleted active collection when replacement selection fails', () => {
		const activeCollection = { name: 'default', mods: ['local:active'] };
		writeTestCollection(tempDir, activeCollection);
		fs.writeFileSync(path.join(tempDir, 'collections', 'broken.json'), '{', 'utf8');

		const result = Effect.runSync(
			deleteActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'default' }),
				activeCollection
			})
		);

		expect(result).toMatchObject({
			ok: false,
			code: 'missing-target-collection'
		});
		expect(readCollectionFile(tempDir, 'default')).toEqual(activeCollection);
	});

	it('restores a deleted active collection when fallback creation fails', () => {
		const activeCollection = { name: 'active', mods: ['local:active'] };
		writeTestCollection(tempDir, activeCollection);
		fs.mkdirSync(path.join(tempDir, 'collections', 'default.json'), { recursive: true });

		const result = Effect.runSync(
			deleteActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'active' }),
				activeCollection
			})
		);

		expect(result).toMatchObject({
			ok: false,
			code: 'collection-write-failed'
		});
		expect(readCollectionFile(tempDir, 'active')).toEqual(activeCollection);
		expect(fs.existsSync(path.join(tempDir, 'collections', 'default.json'))).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
	});

	it('resolves startup repair through the active collection transition', () => {
		writeTestCollection(tempDir, { name: 'zeta', mods: [] });
		writeTestCollection(tempDir, { name: 'alpha', mods: ['local:a'] });

		const result = Effect.runSync(
			resolveStartupActiveCollectionTransition(tempDir, {
				config: createTestAppConfig({ activeCollection: 'missing' })
			})
		);

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

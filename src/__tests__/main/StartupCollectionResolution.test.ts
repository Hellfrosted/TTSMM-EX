import { Effect } from 'effect';
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readCollectionFile } from '../../main/collection-store';
import { readConfigFile } from '../../main/config-store';
import { resolveStartupCollection } from '../../main/startup-collection-resolution';
import { createTempDir, createTestAppConfig, writeTestCollection } from './test-utils';

describe('startup collection resolution', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-startup-collection-resolution-');
	});

	it('keeps a valid Active Collection without rewriting persisted shapes', () => {
		writeTestCollection(tempDir, { name: 'default', mods: ['local:a'] });
		writeTestCollection(tempDir, { name: 'other', mods: [] });

		const result = Effect.runSync(resolveStartupCollection(tempDir, createTestAppConfig({ activeCollection: 'default' })));

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
		writeTestCollection(tempDir, { name: 'zeta', mods: [] });
		writeTestCollection(tempDir, { name: 'alpha', mods: ['local:a'] });

		const result = Effect.runSync(resolveStartupCollection(tempDir, createTestAppConfig({ activeCollection: 'missing' })));

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
		const result = Effect.runSync(resolveStartupCollection(tempDir, createTestAppConfig({ activeCollection: undefined })));

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
		writeTestCollection(tempDir, { name: 'alpha', mods: [] });
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });

		const result = Effect.runSync(resolveStartupCollection(tempDir, createTestAppConfig({ activeCollection: 'missing' })));

		expect(result).toMatchObject({
			ok: false,
			code: 'config-write-failed',
			message: 'Failed to persist repaired active collection alpha'
		});
	});

	it('rolls back the default collection when default activation fails', () => {
		fs.mkdirSync(path.join(tempDir, 'config.json'), { recursive: true });

		const result = Effect.runSync(resolveStartupCollection(tempDir, createTestAppConfig({ activeCollection: undefined })));

		expect(result).toMatchObject({
			ok: false,
			code: 'config-write-failed',
			message: 'Failed to persist the default active collection during boot'
		});
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
	});
});

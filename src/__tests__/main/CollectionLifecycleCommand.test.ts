import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { executeCollectionLifecycleCommand, readCollectionFile, updateCollectionFile } from '../../main/collection-lifecycle';
import { createTempDir } from './test-utils';

describe('collection lifecycle command dispatcher', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-collection-lifecycle-command-test-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('creates, renames, and deletes collections through the unified lifecycle command channel', () => {
		expect(executeCollectionLifecycleCommand(tempDir, { action: 'create', collection: { name: 'default', mods: ['local:one'] } })).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:one'] });

		expect(
			executeCollectionLifecycleCommand(tempDir, {
				action: 'rename',
				collection: { name: 'default', mods: ['local:two'] },
				newName: 'renamed'
			})
		).toBe(true);
		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({ name: 'renamed', mods: ['local:two'] });

		expect(executeCollectionLifecycleCommand(tempDir, { action: 'delete', collection: 'renamed' })).toBe(true);
		expect(readCollectionFile(tempDir, 'renamed')).toBeNull();
	});

	it('does not overwrite an existing collection when a rename command targets that name', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);
		expect(updateCollectionFile(tempDir, { name: 'existing', mods: ['local:existing'] })).toBe(true);

		expect(
			executeCollectionLifecycleCommand(tempDir, {
				action: 'rename',
				collection: { name: 'default', mods: ['local:new'] },
				newName: 'existing'
			})
		).toBe(false);

		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:old'] });
		expect(readCollectionFile(tempDir, 'existing')).toEqual({ name: 'existing', mods: ['local:existing'] });
	});

	it('rejects invalid lifecycle command names without writing outside the collections directory', () => {
		expect(executeCollectionLifecycleCommand(tempDir, { action: 'create', collection: { name: '..\\..\\escape', mods: [] } })).toBe(false);
		expect(executeCollectionLifecycleCommand(tempDir, { action: 'delete', collection: '..\\..\\escape' })).toBe(false);

		expect(fs.existsSync(path.join(tempDir, 'escape.json'))).toBe(false);
		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(false);
	});
});

import fs from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCollectionFile, renameCollectionFile, updateCollectionFile } from '../../main/ipc/collection-handlers';
import { createTempDir } from './test-utils';

describe('collection handlers', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-collection-test-');
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('returns null for a missing collection file', () => {
		expect(readCollectionFile(tempDir, 'missing')).toBeNull();
		expect(fs.existsSync(`${tempDir}\\collections`)).toBe(true);
	});

	it('rejects invalid collection names before touching the filesystem', () => {
		expect(updateCollectionFile(tempDir, { name: '..\\..\\escape', mods: [] })).toBe(false);
		expect(readCollectionFile(tempDir, '..\\..\\escape')).toBeNull();
		expect(fs.existsSync(`${tempDir}\\collections`)).toBe(false);
	});

	it('renames collections without dropping the latest in-memory mod selection', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);
		expect(renameCollectionFile(tempDir, { name: 'default', mods: ['local:new'] }, 'renamed')).toBe(true);

		expect(readCollectionFile(tempDir, 'default')).toBeNull();
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({
			name: 'renamed',
			mods: ['local:new']
		});
	});
});

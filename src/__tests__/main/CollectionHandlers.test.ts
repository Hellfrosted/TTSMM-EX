import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	listCollections,
	readCollectionFile,
	refersToSameCollectionPath,
	renameCollectionFile,
	updateCollectionFile
} from '../../main/collection-store';
import { writeConfigFile } from '../../main/config-store';
import { registerCollectionHandlers } from '../../main/ipc/collection-handlers';
import { ValidChannel } from '../../shared/ipc';
import { createIpcHandlerHarness, createTempDir, createTestAppConfig } from './test-utils';

function createCollectionHandlerHarness(userDataPath: string) {
	return createIpcHandlerHarness((ipcMain) =>
		registerCollectionHandlers(ipcMain, {
			getUserDataPath: () => userDataPath
		})
	);
}

describe('collection handlers', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-collection-test-');
	});

	it('rejects lifecycle commands from a stale active collection and preserves the saved config', async () => {
		updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] });
		updateCollectionFile(tempDir, { name: 'other', mods: ['local:other'] });
		writeConfigFile(path.join(tempDir, 'config.json'), createTestAppConfig({ activeCollection: 'other' }));
		const { invoke } = createCollectionHandlerHarness(tempDir);
		const result = await invoke(ValidChannel.DELETE_COLLECTION_LIFECYCLE, {
			config: createTestAppConfig({ activeCollection: 'default', workshopID: 1n, treatNuterraSteamBetaAsEquivalent: true }),
			dirtyCollection: { name: 'default', mods: [] }
		});
		expect(result).toMatchObject({ ok: false, code: 'stale-active-collection' });
		expect(readCollectionFile(tempDir, 'default')?.mods).toEqual(['local:old']);
		expect(readCollectionFile(tempDir, 'other')?.mods).toEqual(['local:other']);
	});

	it('recovers the lifecycle journal immediately when a command throws', async () => {
		updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] });
		const config = createTestAppConfig({ activeCollection: 'default', workshopID: 1n, treatNuterraSteamBetaAsEquivalent: true });
		writeConfigFile(path.join(tempDir, 'config.json'), config);
		const journal = path.join(tempDir, 'collection-lifecycle-journal.json');
		const original = fs.readdirSync;
		let failed = false;
		const spy = vi.spyOn(fs, 'readdirSync').mockImplementation(((...args: Parameters<typeof fs.readdirSync>) => {
			if (!failed && fs.existsSync(journal)) {
				failed = true;
				throw new Error('directory read failed');
			}
			return original(...args);
		}) as typeof fs.readdirSync);
		const { invoke } = createCollectionHandlerHarness(tempDir);
		try {
			await expect(invoke(ValidChannel.CREATE_COLLECTION_LIFECYCLE, { config, name: 'new', mods: [] })).rejects.toThrow();
			expect(failed).toBe(true);
			expect(fs.existsSync(journal)).toBe(false);
			expect(readCollectionFile(tempDir, 'default')?.mods).toEqual(['local:old']);
		} finally {
			spy.mockRestore();
		}
	});

	it('preserves both errors and retries recovery when immediate recovery fails', async () => {
		updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] });
		const config = createTestAppConfig({ activeCollection: 'default', workshopID: 1n, treatNuterraSteamBetaAsEquivalent: true });
		writeConfigFile(path.join(tempDir, 'config.json'), config);
		const journal = path.join(tempDir, 'collection-lifecycle-journal.json');
		const original = fs.readdirSync;
		const spy = vi.spyOn(fs, 'readdirSync').mockImplementation(((...args: Parameters<typeof fs.readdirSync>) => {
			if (fs.existsSync(journal)) throw new Error('directory read failed');
			return original(...args);
		}) as typeof fs.readdirSync);
		const { invoke } = createCollectionHandlerHarness(tempDir);
		try {
			const error = await invoke(ValidChannel.CREATE_COLLECTION_LIFECYCLE, { config, name: 'new', mods: [] }).catch((value) => value);
			expect(error).toBeInstanceOf(AggregateError);
			expect((error as AggregateError).errors).toHaveLength(2);
			expect(fs.existsSync(journal)).toBe(true);
		} finally {
			spy.mockRestore();
		}
		await expect(invoke(ValidChannel.READ_COLLECTION, 'default')).resolves.toEqual({ name: 'default', mods: ['local:old'] });
		expect(fs.existsSync(journal)).toBe(false);
	});

	it('returns null for a missing collection file', () => {
		expect(readCollectionFile(tempDir, 'missing')).toBeNull();
		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(true);
	});

	it('does not create a second collection when directory inspection fails', () => {
		const dir = path.join(tempDir, 'collections');
		fs.mkdirSync(dir, { recursive: true });
		const original = path.join(dir, 'foo.JSON');
		fs.writeFileSync(original, JSON.stringify({ mods: ['local:keep'] }));
		const exists = fs.existsSync;
		const existsSpy = vi
			.spyOn(fs, 'existsSync')
			.mockImplementation((target) => (target === path.join(dir, 'foo.json') ? false : exists(target)));
		const spy = vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
			throw new Error('access denied');
		});
		try {
			expect(() => readCollectionFile(tempDir, 'foo')).toThrow();
			expect(updateCollectionFile(tempDir, { name: 'foo', mods: [] })).toBe(false);
		} finally {
			spy.mockRestore();
			existsSpy.mockRestore();
		}
		expect(JSON.parse(fs.readFileSync(original, 'utf8'))).toEqual({ mods: ['local:keep'] });
		expect(fs.readdirSync(dir)).toEqual(['foo.JSON']);
	});

	it('throws when a collection file exists but contains malformed json', () => {
		const collectionsDir = path.join(tempDir, 'collections');
		fs.mkdirSync(collectionsDir, { recursive: true });
		fs.writeFileSync(path.join(collectionsDir, 'broken.json'), '{ bad json', 'utf8');

		expect(() => readCollectionFile(tempDir, 'broken')).toThrow('Failed to load collection "broken"');
	});

	it('throws when a collection file exists but has an invalid shape', () => {
		const collectionsDir = path.join(tempDir, 'collections');
		fs.mkdirSync(collectionsDir, { recursive: true });
		fs.writeFileSync(path.join(collectionsDir, 'broken.json'), JSON.stringify({ name: 'broken', mods: 'not-array' }), 'utf8');

		expect(() => readCollectionFile(tempDir, 'broken')).toThrow('Failed to load collection "broken"');
	});

	it('rejects invalid collection names before touching the filesystem', () => {
		expect(updateCollectionFile(tempDir, { name: '..\\..\\escape', mods: [] })).toBe(false);
		expect(readCollectionFile(tempDir, '..\\..\\escape')).toBeNull();
		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(false);
	});

	it('keeps the original collection when saving an existing collection fails', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);

		const originalRenameSync = fs.renameSync;
		const renameSyncSpy = vi.spyOn(fs, 'renameSync').mockImplementation(((oldPath, newPath) => {
			if (String(oldPath).endsWith('.tmp') && String(newPath).endsWith('default.json')) {
				throw new Error('rename failed');
			}

			return originalRenameSync(oldPath, newPath);
		}) as typeof fs.renameSync);

		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:new'] })).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toEqual({
			name: 'default',
			mods: ['local:old']
		});

		renameSyncSpy.mockRestore();
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

	it('does not create a destination when the collection to rename is missing', () => {
		expect(renameCollectionFile(tempDir, { name: 'missing', mods: ['local:new'] }, 'renamed')).toBe(false);
		expect(readCollectionFile(tempDir, 'renamed')).toBeNull();
	});

	it('keeps the original collection when rewriting the renamed file fails', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);

		const renamedPath = path.join(tempDir, 'collections', 'renamed.json');
		const originalRenameSync = fs.renameSync;
		const renameSyncSpy = vi.spyOn(fs, 'renameSync').mockImplementation(((oldPath, newPath) => {
			if (String(oldPath).endsWith('.tmp') && String(newPath) === renamedPath) {
				throw new Error('disk full');
			}

			return originalRenameSync(oldPath, newPath);
		}) as typeof fs.renameSync);

		expect(renameCollectionFile(tempDir, { name: 'default', mods: ['local:new'] }, 'renamed')).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toEqual({
			name: 'default',
			mods: ['local:old']
		});
		expect(fs.existsSync(renamedPath)).toBe(false);

		renameSyncSpy.mockRestore();
	});

	it('refuses to rename over an existing collection file', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);
		expect(updateCollectionFile(tempDir, { name: 'renamed', mods: ['local:existing'] })).toBe(true);

		expect(renameCollectionFile(tempDir, { name: 'default', mods: ['local:new'] }, 'renamed')).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toEqual({
			name: 'default',
			mods: ['local:old']
		});
		expect(readCollectionFile(tempDir, 'renamed')).toEqual({
			name: 'renamed',
			mods: ['local:existing']
		});
	});

	it('treats realpath aliases as the same collection path', () => {
		const originalExistsSync = fs.existsSync;
		const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation(((targetPath) => {
			if (String(targetPath).endsWith('default.json') || String(targetPath).endsWith('Default.json')) {
				return true;
			}

			return originalExistsSync(targetPath);
		}) as typeof fs.existsSync);
		const realpathNativeSpy = vi.spyOn(fs.realpathSync, 'native').mockImplementation(((targetPath) => {
			if (String(targetPath).endsWith('default.json') || String(targetPath).endsWith('Default.json')) {
				return path.join(tempDir, 'collections', 'default.json');
			}

			return String(targetPath);
		}) as typeof fs.realpathSync.native);

		expect(
			refersToSameCollectionPath(path.join(tempDir, 'collections', 'default.json'), path.join(tempDir, 'collections', 'Default.json'))
		).toBe(true);

		realpathNativeSpy.mockRestore();
		existsSyncSpy.mockRestore();
	});

	it('removes the newly written rename target when deleting the source collection fails', () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);

		const originalUnlinkSync = fs.unlinkSync;
		const unlinkSyncSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(((targetPath) => {
			if (String(targetPath).endsWith(path.join('collections', 'default.json'))) {
				throw new Error('permission denied');
			}

			return originalUnlinkSync(targetPath);
		}) as typeof fs.unlinkSync);

		expect(renameCollectionFile(tempDir, { name: 'default', mods: ['local:new'] }, 'renamed')).toBe(false);
		expect(readCollectionFile(tempDir, 'default')).toEqual({
			name: 'default',
			mods: ['local:old']
		});
		expect(readCollectionFile(tempDir, 'renamed')).toBeNull();

		unlinkSyncSpy.mockRestore();
	});

	it('lists only valid json collection files', () => {
		const collectionsDir = path.join(tempDir, 'collections');
		fs.mkdirSync(collectionsDir, { recursive: true });
		fs.writeFileSync(path.join(collectionsDir, 'alpha.json'), '{}', 'utf8');
		fs.writeFileSync(path.join(collectionsDir, 'beta.JSON'), '{}', 'utf8');
		fs.writeFileSync(path.join(collectionsDir, 'alpha.json.bak'), '{}', 'utf8');
		fs.writeFileSync(path.join(collectionsDir, 'notes.txt'), '{}', 'utf8');
		fs.writeFileSync(path.join(collectionsDir, 'bad..json'), '{}', 'utf8');
		fs.mkdirSync(path.join(collectionsDir, 'archived.json'));

		expect(listCollections(tempDir).sort()).toEqual(['alpha', 'beta']);
	});

	it('reads collections whose JSON extension uses uppercase on a case-sensitive filesystem', () => {
		const collectionsDir = path.join(tempDir, 'collections');
		const upperPath = path.join(collectionsDir, 'beta.JSON');
		const lowerPath = path.join(collectionsDir, 'beta.json');
		fs.mkdirSync(collectionsDir, { recursive: true });
		fs.writeFileSync(upperPath, JSON.stringify({ mods: ['local:a'] }));
		const exists = fs.existsSync;
		const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((target) => (String(target) === lowerPath ? false : exists(target)));
		const readSpy = vi.spyOn(fs, 'readFileSync');
		try {
			expect(readCollectionFile(tempDir, 'beta')).toEqual({ name: 'beta', mods: ['local:a'] });
			expect(readSpy).toHaveBeenCalledWith(upperPath, 'utf8');
		} finally {
			readSpy.mockRestore();
			existsSpy.mockRestore();
		}
	});

	it('rejects malformed update payloads at the ipc seam', async () => {
		const { invoke } = createCollectionHandlerHarness(tempDir);

		await expect(invoke(ValidChannel.UPDATE_COLLECTION, { collectionName: 'default', mods: 'not-array' })).rejects.toThrow(
			'Invalid IPC payload for update-collection'
		);

		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(false);
	});

	it('rejects duplicate mod identities before saving collection content', async () => {
		updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] });
		const { invoke } = createCollectionHandlerHarness(tempDir);
		await expect(invoke(ValidChannel.UPDATE_COLLECTION, { collectionName: 'default', mods: ['local:a', 'local:a'] })).rejects.toThrow(
			'Invalid IPC payload for update-collection'
		);
		expect(readCollectionFile(tempDir, 'default')?.mods).toEqual(['local:old']);
	});

	it('loads stored collections with duplicate mod IDs as a unique ordered selection', () => {
		const directory = path.join(tempDir, 'collections');
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, 'default.json'), JSON.stringify({ mods: ['local:a', 'local:b', 'local:a'] }));
		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:a', 'local:b'] });
	});

	it('only updates content for an existing collection at the ipc seam', async () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);
		writeConfigFile(path.join(tempDir, 'config.json'), createTestAppConfig({ activeCollection: 'default' }));
		const { invoke } = createCollectionHandlerHarness(tempDir);

		await expect(
			invoke(ValidChannel.UPDATE_COLLECTION, {
				collectionName: 'default',
				mods: ['local:new']
			})
		).resolves.toEqual({ ok: true, collection: { name: 'default', mods: ['local:new'] } });
		await expect(
			invoke(ValidChannel.UPDATE_COLLECTION, {
				collectionName: 'fresh',
				mods: ['local:fresh']
			})
		).resolves.toEqual({
			ok: false,
			code: 'stale-active-collection',
			message: 'The active collection changed. Reload before saving.'
		});

		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:new'] });
		expect(readCollectionFile(tempDir, 'fresh')).toBeNull();
	});

	it('rejects a stale save after switching the active collection', async () => {
		updateCollectionFile(tempDir, { name: 'old', mods: ['local:old'] });
		updateCollectionFile(tempDir, { name: 'current', mods: [] });
		writeConfigFile(path.join(tempDir, 'config.json'), createTestAppConfig({ activeCollection: 'current' }));
		const { invoke } = createCollectionHandlerHarness(tempDir);
		await expect(invoke(ValidChannel.UPDATE_COLLECTION, { collectionName: 'old', mods: ['local:stale'] })).resolves.toMatchObject({
			ok: false,
			code: 'stale-active-collection'
		});
		expect(readCollectionFile(tempDir, 'old')?.mods).toEqual(['local:old']);
	});

	it('rejects malformed collection names at the ipc seam', async () => {
		const { invoke } = createCollectionHandlerHarness(tempDir);

		await expect(invoke(ValidChannel.READ_COLLECTION, 42)).rejects.toThrow('Invalid IPC payload for read-collection');
	});

	it('resolves startup collection state at the main-process ipc seam', async () => {
		expect(updateCollectionFile(tempDir, { name: 'alpha', mods: ['local:a'] })).toBe(true);
		const { invoke } = createCollectionHandlerHarness(tempDir);

		const result = await invoke(ValidChannel.RESOLVE_STARTUP_COLLECTION, {
			config: {
				closeOnLaunch: false,
				language: 'english',
				gameExec: '',
				workshopID: BigInt(2790161231),
				logsDir: '',
				activeCollection: 'missing',
				steamMaxConcurrency: 5,
				currentPath: '/collections/main',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map(),
				treatNuterraSteamBetaAsEquivalent: true
			}
		});

		expect(result).toMatchObject({
			ok: true,
			activeCollection: { name: 'alpha', mods: ['local:a'] },
			collectionNames: ['alpha'],
			config: { activeCollection: 'alpha' }
		});
	});
});

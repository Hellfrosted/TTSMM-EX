import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	listCollections,
	readCollectionFile,
	refersToSameCollectionPath,
	renameCollectionFile,
	updateCollectionFile
} from '../../main/collection-store';
import { registerCollectionHandlers } from '../../main/ipc/collection-handlers';
import { ValidChannel } from '../../shared/ipc';
import { createTempDir, createValidIpcEvent } from './test-utils';

function createCollectionHandlerHarness(userDataPath: string) {
	const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
	const ipcMain = {
		handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
			handlers.set(channel, handler);
		})
	};

	registerCollectionHandlers(ipcMain as never, {
		getUserDataPath: () => userDataPath
	});

	const invoke = <T>(channel: ValidChannel, ...args: unknown[]) => {
		const handler = handlers.get(channel);
		if (!handler) {
			throw new Error(`Missing handler for ${channel}`);
		}
		return handler(createValidIpcEvent(), ...args) as Promise<T>;
	};

	return { invoke };
}

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
		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(true);
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

	it('rejects malformed update payloads at the ipc seam', async () => {
		const { invoke } = createCollectionHandlerHarness(tempDir);

		await expect(invoke(ValidChannel.UPDATE_COLLECTION, { collectionName: 'default', mods: 'not-array' })).rejects.toThrow(
			'Invalid IPC payload for update-collection'
		);

		expect(fs.existsSync(path.join(tempDir, 'collections'))).toBe(false);
	});

	it('only updates content for an existing collection at the ipc seam', async () => {
		expect(updateCollectionFile(tempDir, { name: 'default', mods: ['local:old'] })).toBe(true);
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
			code: 'missing-collection',
			message: 'Collection fresh does not exist'
		});

		expect(readCollectionFile(tempDir, 'default')).toEqual({ name: 'default', mods: ['local:new'] });
		expect(readCollectionFile(tempDir, 'fresh')).toBeNull();
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

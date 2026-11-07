import { describe, expect, it, vi } from 'vitest';
import { runConfigTransaction } from '../../main/config-transaction';
import { registerCollectionHandlers } from '../../main/ipc/collection-handlers';
import { registerConfigHandlers } from '../../main/ipc/config-handlers';
import { createDefaultAppConfig } from '../../shared/app-config-defaults';
import { ValidChannel } from '../../shared/ipc';
import { createIpcHandlerHarness, createTempDir, writeTestCollection } from './test-utils';

describe('config transactions', () => {
	it('serializes operations on the same user data and continues after a failure', async () => {
		const directory = createTempDir('ttsmm-config-transaction-');
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const events: string[] = [];
		const first = runConfigTransaction(directory, async () => {
			events.push('first started');
			await gate;
			events.push('first failed');
			throw new Error('write failed');
		});
		const second = runConfigTransaction(directory, async () => {
			events.push('second started');
			return 'saved';
		});
		const rejection = expect(first).rejects.toThrow('write failed');
		await vi.waitFor(() => expect(events).toEqual(['first started']));
		release();
		await rejection;
		await expect(second).resolves.toBe('saved');
		expect(events).toEqual(['first started', 'first failed', 'second started']);
	});

	it('orders startup collection repair before a config read at the IPC boundary', async () => {
		const directory = createTempDir('ttsmm-config-transaction-ipc-');
		const provider = { getUserDataPath: () => directory };
		const { invoke } = createIpcHandlerHarness((ipcMain) => {
			registerConfigHandlers(ipcMain, false, provider);
			registerCollectionHandlers(ipcMain, provider);
		});
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const blocker = runConfigTransaction(directory, () => gate);
		const startup = invoke(ValidChannel.RESOLVE_STARTUP_COLLECTION, { config: createDefaultAppConfig('win32') });
		const read = invoke(ValidChannel.READ_CONFIG);
		release();
		await blocker;
		await expect(startup).resolves.toMatchObject({ ok: true, config: { activeCollection: 'default' } });
		await expect(read).resolves.toMatchObject({ activeCollection: 'default' });
	});

	it('holds collection content saves behind lifecycle transactions', async () => {
		const directory = createTempDir('ttsmm-collection-transaction-ipc-');
		writeTestCollection(directory, { name: 'default', mods: [] });
		const { invoke } = createIpcHandlerHarness((ipcMain) => registerCollectionHandlers(ipcMain, { getUserDataPath: () => directory }));
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const blocker = runConfigTransaction(directory, () => gate);
		let settled = false;
		const save = invoke(ValidChannel.UPDATE_COLLECTION, { collectionName: 'default', mods: ['local:new'] }).then((result) => {
			settled = true;
			return result;
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
		expect(settled).toBe(false);
		release();
		await blocker;
		await expect(save).resolves.toMatchObject({ ok: true, collection: { mods: ['local:new'] } });
	});
});

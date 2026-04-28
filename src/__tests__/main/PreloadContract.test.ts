import { contextBridge, ipcRenderer } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ValidChannel } from '../../shared/ipc';

vi.mock('electron', async () => import('../../../test-support/electron-renderer'));
vi.mock('electron-log', () => ({
	default: {
		functions: {
			info: vi.fn(),
			debug: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			silly: vi.fn(),
			verbose: vi.fn()
		}
	}
}));

const forbiddenLifecycleShortcuts = ['createCollection', 'renameCollection', 'deleteCollection', 'switchCollection'];

describe('preload collection contract', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	async function exposePreloadApi() {
		await import('../../main/preload');
		const exposedCall = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.at(-1);
		if (!exposedCall) {
			throw new Error('preload did not expose an API');
		}
		return exposedCall[1] as Record<string, (...args: unknown[]) => unknown>;
	}

	it('does not expose direct collection lifecycle shortcuts', async () => {
		const exposedApi = await exposePreloadApi();

		for (const shortcut of forbiddenLifecycleShortcuts) {
			expect(exposedApi).not.toHaveProperty(shortcut);
		}
	});

	it('routes lifecycle commands through the lifecycle command channel', async () => {
		const exposedApi = await exposePreloadApi();
		const command = { action: 'delete', collection: 'default' };

		await exposedApi.executeCollectionLifecycleCommand(command);

		expect(ipcRenderer.invoke).toHaveBeenCalledWith(ValidChannel.COLLECTION_LIFECYCLE_COMMAND, command);
	});

	it('keeps content save on the content save channel', async () => {
		const exposedApi = await exposePreloadApi();
		const collection = { name: 'default', mods: ['local:one'] };

		await exposedApi.saveCollectionContent(collection);

		expect(ipcRenderer.invoke).toHaveBeenCalledWith(ValidChannel.UPDATE_COLLECTION, collection);
	});
});

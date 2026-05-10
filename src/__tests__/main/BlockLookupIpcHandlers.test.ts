import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { registerBlockLookupHandlers } from '../../main/ipc/block-lookup-handlers';
import { ValidChannel } from '../../shared/ipc';
import { createIpcHandlerHarness, createTempDir, createValidIpcEvent } from './test-utils';

function createBlockLookupHandlerHarness() {
	const userDataPath = createTempDir('ttsmm-block-lookup-ipc-');
	const harness = createIpcHandlerHarness((ipcMain) =>
		registerBlockLookupHandlers(ipcMain, {
			getUserDataPath: () => userDataPath
		})
	);

	return {
		...harness,
		userDataPath
	};
}

describe('block lookup ipc handlers', () => {
	it('rejects malformed settings payloads before writing settings', async () => {
		const { invoke, userDataPath } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, { workshopRoot: 42 })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-save-settings'
		);

		expect(fs.existsSync(path.join(userDataPath, 'block-lookup-settings.json'))).toBe(false);
	});

	it('rejects malformed build request payloads', async () => {
		const { invoke } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, { modSources: 'not-an-array' })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-build-index'
		);
		await expect(invoke(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, { forceRebuild: 'yes' })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-autodetect-workshop-root'
		);
	});

	it('rejects malformed search payloads before reading the index', async () => {
		const { invoke } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, { limit: 10 })).rejects.toThrow('Invalid IPC payload for block-lookup-search');
		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, { query: '', limit: 1001 })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-search'
		);
	});

	it('accepts valid search payloads', async () => {
		const { invoke } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, { query: '', limit: 10 })).resolves.toEqual({
			rows: [],
			stats: null
		});
	});

	it('emits determinate progress while building the index', async () => {
		const { invokeWithEvent } = createBlockLookupHandlerHarness();
		const send = vi.fn();

		await expect(
			invokeWithEvent(
				ValidChannel.BLOCK_LOOKUP_BUILD_INDEX,
				{
					...createValidIpcEvent(),
					sender: { send }
				},
				{ forceRebuild: true, modSources: [] }
			)
		).resolves.toEqual({
			stats: expect.objectContaining({ blocks: 0, sources: 0 })
		});

		expect(send).toHaveBeenCalledWith(ValidChannel.BLOCK_LOOKUP_INDEX_PROGRESS, expect.objectContaining({ phase: 'planning', percent: 0 }));
		expect(send).toHaveBeenCalledWith(
			ValidChannel.BLOCK_LOOKUP_INDEX_PROGRESS,
			expect.objectContaining({ phase: 'complete', percent: 100 })
		);
	});
});

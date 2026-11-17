import { describe, expect, it } from 'vitest';
import { registerBlockLookupHandlers } from '../../main/ipc/block-lookup-handlers';
import { registerCollectionHandlers } from '../../main/ipc/collection-handlers';
import { registerConfigHandlers } from '../../main/ipc/config-handlers';
import { registerGameHandlers } from '../../main/ipc/game-handlers';
import { registerModHandlers } from '../../main/ipc/mod-handlers';
import { registerPopulationPoolHandlers } from '../../main/ipc/population-pool-handlers';
import { ipcInvokeChannels, ipcSendChannels } from '../../shared/ipc-contract';
import { createTempDir } from './test-utils';

function registerAllMainHandlers() {
	const handledChannels = new Set<string>();
	const listenerChannels = new Set<string>();
	const ipcMain = {
		handle: (channel: string) => {
			handledChannels.add(channel);
		},
		on: (channel: string) => {
			listenerChannels.add(channel);
		}
	};
	const userDataPathProvider = { getUserDataPath: () => createTempDir('ttsmm-ipc-contract-') };
	const mainWindowProvider = { getWebContents: () => null };
	const steamStatus = { inited: true, readiness: { kind: 'ready', retryable: false } } as const;

	registerConfigHandlers(ipcMain as never, true, userDataPathProvider);
	registerBlockLookupHandlers(ipcMain as never, userDataPathProvider);
	registerPopulationPoolHandlers(ipcMain as never, userDataPathProvider);
	registerCollectionHandlers(ipcMain as never, userDataPathProvider);
	registerGameHandlers(ipcMain as never);
	registerModHandlers(
		ipcMain as never,
		mainWindowProvider as never,
		() => steamStatus,
		() => steamStatus
	);

	return {
		handledChannels,
		listenerChannels
	};
}

describe('ipc contract', () => {
	it('registers every request and send-only contract channel in the main process', () => {
		const { handledChannels, listenerChannels } = registerAllMainHandlers();

		expect(Object.values(ipcInvokeChannels).sort()).toEqual(Array.from(handledChannels).sort());
		expect(Object.values(ipcSendChannels).sort()).toEqual(Array.from(listenerChannels).sort());
	});
});

import { describe, expect, it } from 'vitest';
import { ipcInvokeChannels, ipcSendChannels, ipcSubscriptionChannels } from '../../shared/ipc-contract';
import { ValidChannel } from '../../shared/ipc';
import { registerBlockLookupHandlers } from '../../main/ipc/block-lookup-handlers';
import { registerCollectionHandlers } from '../../main/ipc/collection-handlers';
import { registerConfigHandlers } from '../../main/ipc/config-handlers';
import { registerGameHandlers } from '../../main/ipc/game-handlers';
import { registerModHandlers } from '../../main/ipc/mod-handlers';
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
	const steamStatus = { inited: true };

	registerConfigHandlers(ipcMain as never, true, userDataPathProvider);
	registerBlockLookupHandlers(ipcMain as never, userDataPathProvider);
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
	it('maps exposed invoke methods to their stable channels', () => {
		expect(ipcInvokeChannels).toMatchObject({
			buildBlockLookupIndex: ValidChannel.BLOCK_LOOKUP_BUILD_INDEX,
			readModMetadata: ValidChannel.READ_MOD_METADATA,
			readCollectionsList: ValidChannel.READ_COLLECTIONS,
			updateConfig: ValidChannel.UPDATE_CONFIG
		});
		expect(Object.keys(ipcInvokeChannels).sort()).toEqual([
			'autoDetectBlockLookupWorkshopRoot',
			'buildBlockLookupIndex',
			'deleteCollection',
			'discoverGameExecutable',
			'downloadMod',
			'fetchWorkshopDependencies',
			'getBlockLookupStats',
			'getUserDataPath',
			'isGameRunning',
			'launchGame',
			'pathExists',
			'readBlockLookupSettings',
			'readCollection',
			'readCollectionsList',
			'readConfig',
			'readModMetadata',
			'renameCollection',
			'saveBlockLookupSettings',
			'searchBlockLookup',
			'selectPath',
			'steamworksInited',
			'subscribeMod',
			'unsubscribeMod',
			'updateCollection',
			'updateConfig'
		]);
	});

	it('maps send and subscription methods to their stable channels', () => {
		expect(ipcSendChannels).toEqual({
			openModBrowser: ValidChannel.OPEN_MOD_BROWSER,
			openModContextMenu: ValidChannel.OPEN_MOD_CONTEXT_MENU,
			openModSteam: ValidChannel.OPEN_MOD_STEAM,
			updateLogLevel: ValidChannel.UPDATE_LOG_LEVEL
		});
		expect(ipcSubscriptionChannels).toEqual({
			onModMetadataUpdate: ValidChannel.MOD_METADATA_UPDATE,
			onModRefreshRequested: ValidChannel.MOD_REFRESH_REQUESTED,
			onProgressChange: ValidChannel.PROGRESS_CHANGE,
			onReloadSteamworks: ValidChannel.RELOAD_STEAMWORKS
		});
	});

	it('registers every request and send-only contract channel in the main process', () => {
		const { handledChannels, listenerChannels } = registerAllMainHandlers();

		expect([...Object.values(ipcInvokeChannels)].sort()).toEqual([...handledChannels].sort());
		expect([...Object.values(ipcSendChannels)].sort()).toEqual([...listenerChannels].sort());
	});
});

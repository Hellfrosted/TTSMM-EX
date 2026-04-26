import { describe, expect, it } from 'vitest';
import { ipcInvokeChannels, ipcSendChannels, ipcSubscriptionChannels } from '../../shared/ipc-contract';
import { ValidChannel } from '../../shared/ipc';

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
});

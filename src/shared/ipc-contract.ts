import type { ElectronApi } from './electron-api';
import { ValidChannel } from './ipc';

type IpcInvokeMethod = Exclude<
	{
		[K in keyof ElectronApi]: ElectronApi[K] extends (...args: never[]) => Promise<unknown> ? K : never;
	}[keyof ElectronApi],
	never
>;
type IpcSendMethod = 'openModBrowser' | 'openModContextMenu' | 'openModSteam' | 'updateLogLevel';
type IpcSubscriptionMethod = 'onModMetadataUpdate' | 'onModRefreshRequested' | 'onProgressChange' | 'onReloadSteamworks';

export const ipcInvokeChannels = {
	autoDetectBlockLookupWorkshopRoot: ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT,
	buildBlockLookupIndex: ValidChannel.BLOCK_LOOKUP_BUILD_INDEX,
	deleteCollection: ValidChannel.DELETE_COLLECTION,
	discoverGameExecutable: ValidChannel.DISCOVER_GAME_EXEC,
	downloadMod: ValidChannel.DOWNLOAD_MOD,
	fetchWorkshopDependencies: ValidChannel.FETCH_WORKSHOP_DEPENDENCIES,
	getBlockLookupStats: ValidChannel.BLOCK_LOOKUP_STATS,
	getUserDataPath: ValidChannel.USER_DATA_PATH,
	isGameRunning: ValidChannel.GAME_RUNNING,
	launchGame: ValidChannel.LAUNCH_GAME,
	pathExists: ValidChannel.PATH_EXISTS,
	readBlockLookupSettings: ValidChannel.BLOCK_LOOKUP_READ_SETTINGS,
	readCollection: ValidChannel.READ_COLLECTION,
	readCollectionsList: ValidChannel.READ_COLLECTIONS,
	readConfig: ValidChannel.READ_CONFIG,
	readModMetadata: ValidChannel.READ_MOD_METADATA,
	renameCollection: ValidChannel.RENAME_COLLECTION,
	saveBlockLookupSettings: ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS,
	searchBlockLookup: ValidChannel.BLOCK_LOOKUP_SEARCH,
	selectPath: ValidChannel.SELECT_PATH,
	steamworksInited: ValidChannel.STEAMWORKS_INITED,
	subscribeMod: ValidChannel.SUBSCRIBE_MOD,
	unsubscribeMod: ValidChannel.UNSUBSCRIBE_MOD,
	updateCollection: ValidChannel.UPDATE_COLLECTION,
	updateConfig: ValidChannel.UPDATE_CONFIG
} satisfies Record<IpcInvokeMethod, ValidChannel>;

export const ipcSendChannels = {
	openModBrowser: ValidChannel.OPEN_MOD_BROWSER,
	openModContextMenu: ValidChannel.OPEN_MOD_CONTEXT_MENU,
	openModSteam: ValidChannel.OPEN_MOD_STEAM,
	updateLogLevel: ValidChannel.UPDATE_LOG_LEVEL
} satisfies Record<IpcSendMethod, ValidChannel>;

export const ipcSubscriptionChannels = {
	onModMetadataUpdate: ValidChannel.MOD_METADATA_UPDATE,
	onModRefreshRequested: ValidChannel.MOD_REFRESH_REQUESTED,
	onProgressChange: ValidChannel.PROGRESS_CHANGE,
	onReloadSteamworks: ValidChannel.RELOAD_STEAMWORKS
} satisfies Record<IpcSubscriptionMethod, ValidChannel>;

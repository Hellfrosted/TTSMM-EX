export enum ValidChannel {
	STEAMWORKS_INITED = 'steamworks-inited',
	RELOAD_STEAMWORKS = 'reload-steamworks',
	UPDATE_LOG_LEVEL = 'log-level',
	GAME_RUNNING = 'game-running',
	LAUNCH_GAME = 'launch-game',
	DISCOVER_GAME_EXEC = 'discover-game-exec',
	PATH_EXISTS = 'path-exists',
	USER_DATA_PATH = 'user-data-path',
	PROGRESS_CHANGE = 'progress-change',
	READ_MOD_METADATA = 'read-mod-metadata',
	FETCH_WORKSHOP_DEPENDENCIES = 'fetch-workshop-dependencies',
	SUBSCRIBE_MOD = 'subscribe-mod',
	UNSUBSCRIBE_MOD = 'unsubscribe-mod',
	DOWNLOAD_MOD = 'download-mod',
	MOD_REFRESH_REQUESTED = 'refresh-mod-info',
	READ_CONFIG = 'read-config',
	UPDATE_CONFIG = 'update-config',
	READ_COLLECTION = 'read-collection',
	READ_COLLECTIONS = 'read-collections-list',
	UPDATE_COLLECTION = 'update-collection',
	CREATE_COLLECTION_LIFECYCLE = 'collection-lifecycle-create',
	DUPLICATE_COLLECTION_LIFECYCLE = 'collection-lifecycle-duplicate',
	RENAME_COLLECTION_LIFECYCLE = 'collection-lifecycle-rename',
	DELETE_COLLECTION_LIFECYCLE = 'collection-lifecycle-delete',
	SWITCH_COLLECTION_LIFECYCLE = 'collection-lifecycle-switch',
	RESOLVE_STARTUP_COLLECTION = 'startup-collection-resolve',
	SELECT_PATH = 'select-path',
	BLOCK_LOOKUP_READ_SETTINGS = 'block-lookup-read-settings',
	BLOCK_LOOKUP_SAVE_SETTINGS = 'block-lookup-save-settings',
	BLOCK_LOOKUP_BUILD_INDEX = 'block-lookup-build-index',
	BLOCK_LOOKUP_SEARCH = 'block-lookup-search',
	BLOCK_LOOKUP_STATS = 'block-lookup-stats',
	BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT = 'block-lookup-autodetect-workshop-root',
	OPEN_MOD_CONTEXT_MENU = 'mod-context-menu',
	MOD_METADATA_UPDATE = 'mod-metadata-update',
	OPEN_MOD_BROWSER = 'open-mod-browser',
	OPEN_MOD_STEAM = 'open-mod-steam'
}

export enum ProgressTypes {
	MOD_LOAD = 'mod-load'
}

export enum PathType {
	FILE,
	DIRECTORY
}

export enum LogLevel {
	ERROR = 'error',
	WARN = 'warn',
	INFO = 'info',
	VERBOSE = 'verbose',
	DEBUG = 'debug',
	SILLY = 'silly'
}

export type SteamworksReadinessKind = 'ready' | 'native-module-unavailable' | 'steam-not-running' | 'wrong-app-id' | 'unknown-failure';

export interface SteamworksReadiness {
	kind: SteamworksReadinessKind;
	retryable: boolean;
}

export interface SteamworksStatus {
	inited: boolean;
	error?: string;
	readiness: SteamworksReadiness;
}

export interface ProgressUpdatePayload {
	type: ProgressTypes;
	progress: number;
	progressMessage: string;
}

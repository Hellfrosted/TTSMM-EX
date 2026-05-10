import type { AppConfig } from 'model/AppConfig';
import type { ModData } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import type { SessionMods } from 'model/SessionMods';
import type {
	CollectionLifecycleResult,
	CreateCollectionLifecycleRequest,
	DeleteCollectionLifecycleRequest,
	DuplicateCollectionLifecycleRequest,
	RenameCollectionLifecycleRequest,
	SwitchCollectionLifecycleRequest
} from './collection-lifecycle';
import type { CollectionContentSaveRequest, CollectionContentSaveResult } from './collection-content-save';
import type { StartupCollectionResolutionRequest, StartupCollectionResolutionResult } from './startup-collection-resolution';
import type {
	BlockLookupBuildRequest,
	BlockLookupBuildResult,
	BlockLookupIndexProgressCallback,
	BlockLookupIndexStats,
	BlockLookupSearchRequest,
	BlockLookupSearchResult,
	BlockLookupSettings
} from './block-lookup';
import type { LogLevel, PathType, ProgressUpdatePayload, SteamworksStatus } from './ipc';
import type { ModContextMenuRequest } from './mod-context-menu';
import type { WorkshopDependencyRefreshResult } from './workshop-dependency-snapshot';

export type ElectronLogFunctions = {
	info: (message: unknown) => void;
	debug: (message: unknown) => void;
	warn: (message: unknown) => void;
	error: (message: unknown) => void;
	silly: (message: unknown) => void;
	verbose: (message: unknown) => void;
};

export type ElectronPlatform =
	| 'aix'
	| 'android'
	| 'darwin'
	| 'freebsd'
	| 'haiku'
	| 'linux'
	| 'openbsd'
	| 'sunos'
	| 'win32'
	| 'cygwin'
	| 'netbsd';

export type Unsubscribe = () => void;
export type ProgressChangeCallback = (
	type: ProgressUpdatePayload['type'],
	progress: ProgressUpdatePayload['progress'],
	progressMessage: ProgressUpdatePayload['progressMessage']
) => void;

export interface ElectronApi {
	platform: ElectronPlatform;
	uiSmokeMode: boolean;
	log: ElectronLogFunctions;
	updateLogLevel: (level: LogLevel) => void;
	getUserDataPath: () => Promise<string>;
	readConfig: () => Promise<AppConfig | null>;
	updateConfig: (config: AppConfig) => Promise<AppConfig | null>;
	readCollection: (collection: string) => Promise<ModCollection | null>;
	readCollectionsList: () => Promise<string[]>;
	updateCollection: (request: CollectionContentSaveRequest) => Promise<CollectionContentSaveResult>;
	createCollectionLifecycle: (request: CreateCollectionLifecycleRequest) => Promise<CollectionLifecycleResult>;
	duplicateCollectionLifecycle: (request: DuplicateCollectionLifecycleRequest) => Promise<CollectionLifecycleResult>;
	renameCollectionLifecycle: (request: RenameCollectionLifecycleRequest) => Promise<CollectionLifecycleResult>;
	deleteCollectionLifecycle: (request: DeleteCollectionLifecycleRequest) => Promise<CollectionLifecycleResult>;
	switchCollectionLifecycle: (request: SwitchCollectionLifecycleRequest) => Promise<CollectionLifecycleResult>;
	resolveStartupCollection: (request: StartupCollectionResolutionRequest) => Promise<StartupCollectionResolutionResult>;
	pathExists: (targetPath: string, expectedType?: PathType) => Promise<boolean>;
	discoverGameExecutable: () => Promise<string | null>;
	selectPath: (directory: boolean, title: string) => Promise<string | null>;
	readBlockLookupSettings: () => Promise<BlockLookupSettings>;
	saveBlockLookupSettings: (settings: BlockLookupSettings) => Promise<BlockLookupSettings>;
	buildBlockLookupIndex: (request: BlockLookupBuildRequest) => Promise<BlockLookupBuildResult>;
	searchBlockLookup: (request: BlockLookupSearchRequest) => Promise<BlockLookupSearchResult>;
	getBlockLookupStats: () => Promise<BlockLookupIndexStats | null>;
	autoDetectBlockLookupWorkshopRoot: (request: BlockLookupBuildRequest) => Promise<string | null>;
	launchGame: (gameExec: string, workshopID: string | bigint | null, closeOnLaunch: boolean, args: string[]) => Promise<boolean>;
	isGameRunning: () => Promise<boolean>;
	readModMetadata: (
		localDir: string | undefined,
		allKnownMods: string[],
		options?: { treatNuterraSteamBetaAsEquivalent?: boolean }
	) => Promise<SessionMods>;
	fetchWorkshopDependencies: (workshopID: bigint) => Promise<WorkshopDependencyRefreshResult>;
	steamworksInited: () => Promise<SteamworksStatus>;
	downloadMod: (workshopID: bigint) => Promise<boolean>;
	subscribeMod: (workshopID: bigint) => Promise<boolean>;
	unsubscribeMod: (workshopID: bigint) => Promise<boolean>;
	openModBrowser: (workshopID: bigint) => void;
	openModSteam: (workshopID: bigint) => void;
	openModContextMenu: (request: ModContextMenuRequest) => void;
	onProgressChange: (callback: ProgressChangeCallback) => Unsubscribe;
	onBlockLookupIndexProgress: (callback: BlockLookupIndexProgressCallback) => Unsubscribe;
	onModMetadataUpdate: (callback: (uid: string, update: Partial<ModData>) => void) => Unsubscribe;
	onModRefreshRequested: (callback: () => void) => Unsubscribe;
	onReloadSteamworks: (callback: () => void) => Unsubscribe;
}

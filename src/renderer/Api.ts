import type { AppConfig, NLogLevel } from 'model/AppConfig';
import type { ModData } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import { SessionMods } from 'model/SessionMods';
import { LogLevel, PathType } from 'shared/ipc';
import type {
	CollectionLifecycleResult,
	CreateCollectionLifecycleRequest,
	DeleteCollectionLifecycleRequest,
	DuplicateCollectionLifecycleRequest,
	RenameCollectionLifecycleRequest,
	SwitchCollectionLifecycleRequest
} from 'shared/collection-lifecycle';
import type { StartupCollectionResolutionRequest, StartupCollectionResolutionResult } from 'shared/startup-collection-resolution';
import type {
	BlockLookupBuildRequest,
	BlockLookupBuildResult,
	BlockLookupIndexStats,
	BlockLookupSearchRequest,
	BlockLookupSearchResult,
	BlockLookupSettings
} from 'shared/block-lookup';
import type { CollectionContentSaveRequest, CollectionContentSaveResult } from 'shared/collection-content-save';
import type { ModContextMenuRequest } from 'shared/mod-context-menu';
import { ipcInvokeChannels, ipcSendChannels, ipcSubscriptionChannels } from 'shared/ipc-contract';
import type { ElectronApi, ElectronLogFunctions, ElectronPlatform, ProgressChangeCallback, Unsubscribe } from 'shared/electron-api';
import type { SteamworksStatus } from 'shared/ipc';
import type { WorkshopDependencyRefreshResult } from 'shared/workshop-dependency-snapshot';
import { createGameLaunchCommand, parseExtraLaunchParams } from './game-launch-command';

export { parseExtraLaunchParams };

type ElectronMethod<TMethod extends keyof ElectronApi> = ElectronApi[TMethod] extends (...args: infer TArgs) => infer TResult
	? { args: TArgs; result: TResult }
	: never;
type ElectronInvokeMethod = keyof typeof ipcInvokeChannels;
type ElectronSendMethod = keyof typeof ipcSendChannels;
type ElectronSubscriptionMethod = keyof typeof ipcSubscriptionChannels;

class API {
	platform: ElectronPlatform;

	userDataPath: string | undefined;

	logger: ElectronLogFunctions;

	constructor(window: Window) {
		this.platform = window.electron.platform;
		this.logger = {
			info: (message) => {
				window.electron.log.info(message);
			},
			debug: (message) => {
				window.electron.log.debug(message);
			},
			warn: (message) => {
				window.electron.log.warn(message);
			},
			error: (message) => {
				window.electron.log.error(message);
			},
			silly: (message) => {
				window.electron.log.silly(message);
			},
			verbose: (message) => {
				window.electron.log.verbose(message);
			}
		};
	}

	async getUserDataPath() {
		if (this.userDataPath === undefined) {
			return this.invokeElectron('getUserDataPath').then((resolvedPath: string) => {
				this.userDataPath = resolvedPath;
				return resolvedPath;
			});
		}
		return this.userDataPath;
	}

	private invokeElectron<TMethod extends ElectronInvokeMethod>(
		method: TMethod,
		...args: ElectronMethod<TMethod>['args']
	): ElectronMethod<TMethod>['result'] {
		const electronMethod = window.electron[method] as (...methodArgs: ElectronMethod<TMethod>['args']) => ElectronMethod<TMethod>['result'];
		return electronMethod(...args);
	}

	private sendElectron<TMethod extends ElectronSendMethod>(method: TMethod, ...args: ElectronMethod<TMethod>['args']) {
		const electronMethod = window.electron[method] as (...methodArgs: ElectronMethod<TMethod>['args']) => ElectronMethod<TMethod>['result'];
		electronMethod(...args);
	}

	private subscribeElectron<TMethod extends ElectronSubscriptionMethod>(
		method: TMethod,
		...args: ElectronMethod<TMethod>['args']
	): ElectronMethod<TMethod>['result'] {
		const electronMethod = window.electron[method] as (...methodArgs: ElectronMethod<TMethod>['args']) => ElectronMethod<TMethod>['result'];
		return electronMethod(...args);
	}

	updateLogLevel(level: LogLevel) {
		this.sendElectron('updateLogLevel', level);
	}

	launchGame(
		gameExec: string,
		workshopID: string | bigint,
		closeOnLaunch: boolean,
		modList: ModData[],
		pureVanilla?: boolean,
		logParams?: { [loggerID: string]: NLogLevel },
		extraParams?: string
	): Promise<boolean> {
		const command = createGameLaunchCommand({ extraParams, logParams, modList, pureVanilla, workshopID });
		return this.invokeElectron('launchGame', gameExec, command.workshopID, closeOnLaunch, command.args);
	}

	gameRunning(): Promise<boolean> {
		return this.invokeElectron('isGameRunning');
	}

	onProgressChange(callback: ProgressChangeCallback): Unsubscribe {
		return this.subscribeElectron('onProgressChange', callback);
	}

	onModMetadataUpdate(callback: (uid: string, update: Partial<ModData>) => void): Unsubscribe {
		return this.subscribeElectron('onModMetadataUpdate', callback);
	}

	onModRefreshRequested(callback: () => void): Unsubscribe {
		return this.subscribeElectron('onModRefreshRequested', callback);
	}

	onReloadSteamworks(callback: () => void): Unsubscribe {
		return this.subscribeElectron('onReloadSteamworks', callback);
	}

	pathExists(targetPath: string, type?: PathType): Promise<boolean> {
		return this.invokeElectron('pathExists', targetPath, type);
	}

	discoverGameExecutable(): Promise<string | null> {
		return this.invokeElectron('discoverGameExecutable');
	}

	readConfig(): Promise<AppConfig | null> {
		return this.invokeElectron('readConfig');
	}

	updateConfig(config: AppConfig): Promise<AppConfig | null> {
		return this.invokeElectron('updateConfig', config);
	}

	readCollection(collection: string): Promise<ModCollection | null> {
		return this.invokeElectron('readCollection', collection);
	}

	readCollectionsList(): Promise<string[]> {
		return this.invokeElectron('readCollectionsList');
	}

	updateCollection(request: CollectionContentSaveRequest): Promise<CollectionContentSaveResult> {
		return this.invokeElectron('updateCollection', request);
	}

	createCollectionLifecycle(request: CreateCollectionLifecycleRequest): Promise<CollectionLifecycleResult> {
		return this.invokeElectron('createCollectionLifecycle', request);
	}

	duplicateCollectionLifecycle(request: DuplicateCollectionLifecycleRequest): Promise<CollectionLifecycleResult> {
		return this.invokeElectron('duplicateCollectionLifecycle', request);
	}

	renameCollectionLifecycle(request: RenameCollectionLifecycleRequest): Promise<CollectionLifecycleResult> {
		return this.invokeElectron('renameCollectionLifecycle', request);
	}

	deleteCollectionLifecycle(request: DeleteCollectionLifecycleRequest): Promise<CollectionLifecycleResult> {
		return this.invokeElectron('deleteCollectionLifecycle', request);
	}

	switchCollectionLifecycle(request: SwitchCollectionLifecycleRequest): Promise<CollectionLifecycleResult> {
		return this.invokeElectron('switchCollectionLifecycle', request);
	}

	resolveStartupCollection(request: StartupCollectionResolutionRequest): Promise<StartupCollectionResolutionResult> {
		return this.invokeElectron('resolveStartupCollection', request);
	}

	selectPath(directory: boolean, title: string): Promise<string | null> {
		return this.invokeElectron('selectPath', directory, title);
	}

	readBlockLookupSettings(): Promise<BlockLookupSettings> {
		return this.invokeElectron('readBlockLookupSettings');
	}

	saveBlockLookupSettings(settings: BlockLookupSettings): Promise<BlockLookupSettings> {
		return this.invokeElectron('saveBlockLookupSettings', settings);
	}

	buildBlockLookupIndex(request: BlockLookupBuildRequest): Promise<BlockLookupBuildResult> {
		return this.invokeElectron('buildBlockLookupIndex', request);
	}

	searchBlockLookup(request: BlockLookupSearchRequest): Promise<BlockLookupSearchResult> {
		return this.invokeElectron('searchBlockLookup', request);
	}

	getBlockLookupStats(): Promise<BlockLookupIndexStats | null> {
		return this.invokeElectron('getBlockLookupStats');
	}

	autoDetectBlockLookupWorkshopRoot(request: BlockLookupBuildRequest): Promise<string | null> {
		return this.invokeElectron('autoDetectBlockLookupWorkshopRoot', request);
	}

	readModMetadata(
		localDir: string | undefined,
		allKnownMods: Set<string>,
		options?: { treatNuterraSteamBetaAsEquivalent?: boolean }
	): Promise<SessionMods> {
		return this.invokeElectron('readModMetadata', localDir, [...allKnownMods], options);
	}

	fetchWorkshopDependencies(workshopID: bigint): Promise<WorkshopDependencyRefreshResult> {
		return this.invokeElectron('fetchWorkshopDependencies', workshopID);
	}

	steamworksInited(): Promise<SteamworksStatus> {
		return this.invokeElectron('steamworksInited');
	}

	openModBrowser(workshopID: bigint) {
		this.sendElectron('openModBrowser', workshopID);
	}

	openModSteam(workshopID: bigint) {
		this.sendElectron('openModSteam', workshopID);
	}

	openModContextMenu(request: ModContextMenuRequest) {
		this.sendElectron('openModContextMenu', request);
	}

	downloadMod(workshopID: bigint): Promise<boolean> {
		return this.invokeElectron('downloadMod', workshopID);
	}

	subscribeMod(workshopID: bigint): Promise<boolean> {
		return this.invokeElectron('subscribeMod', workshopID);
	}

	unsubscribeMod(workshopID: bigint): Promise<boolean> {
		return this.invokeElectron('unsubscribeMod', workshopID);
	}
}

export default new API(window);

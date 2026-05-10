import type { AppConfig, NLogLevel } from 'model/AppConfig';
import type { ModData } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import { SessionMods } from 'model/SessionMods';
import { LogLevel, PathType } from 'shared/ipc';
import type {
	BlockLookupBuildRequest,
	BlockLookupBuildResult,
	BlockLookupIndexStats,
	BlockLookupSearchRequest,
	BlockLookupSearchResult,
	BlockLookupSettings
} from 'shared/block-lookup';
import { ipcInvokeChannels, ipcSendChannels, ipcSubscriptionChannels } from 'shared/ipc-contract';
import type { ElectronApi, ElectronLogFunctions, ElectronPlatform, ProgressChangeCallback, Unsubscribe } from 'shared/electron-api';
import type { SteamworksStatus } from 'shared/ipc';

const EXTRA_PARAM_PATTERN = /"([^"]*)"|'([^']*)'|[^\s]+/g;

export function parseExtraLaunchParams(extraParams: string): string[] {
	const matches = extraParams.matchAll(EXTRA_PARAM_PATTERN);
	return [...matches].map((match) => match[1] ?? match[2] ?? match[0]).filter((arg) => arg.length > 0);
}

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
		const workshopIDText = workshopID.toString();
		const actualMods = modList
			.filter((modData) => modData && modData.workshopID !== BigInt(workshopIDText))
			.map((mod: ModData) => {
				return mod ? `[${mod.uid.toString().replaceAll(' ', ':/%20')}]` : '';
			});
		let args: string[] = [];
		let passedWorkshopID: string | null = workshopIDText;

		let addMods = true;
		if (actualMods.length === 0 || (actualMods.length === 1 && actualMods[0] === '[workshop:2571814511]')) {
			if (pureVanilla) {
				passedWorkshopID = null;
				addMods = false;
			}
		}
		if (addMods) {
			const modListStr: string = actualMods.join(',');
			args.push('+ttsmm_mod_list');
			args.push(`[${modListStr}]`);
			if (logParams) {
				Object.entries(logParams).forEach(([loggerID, logLevel]: [string, NLogLevel]) => {
					args.push(loggerID && loggerID.length > 0 ? `+log_level_${loggerID}` : '+log_level');
					args.push(logLevel);
				});
			}
		}
		if (extraParams) {
			args = args.concat(parseExtraLaunchParams(extraParams));
		}
		return this.invokeElectron('launchGame', gameExec, passedWorkshopID, closeOnLaunch, args);
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

	updateConfig(config: AppConfig): Promise<boolean> {
		return this.invokeElectron('updateConfig', config);
	}

	readCollection(collection: string): Promise<ModCollection | null> {
		return this.invokeElectron('readCollection', collection);
	}

	readCollectionsList(): Promise<string[]> {
		return this.invokeElectron('readCollectionsList');
	}

	updateCollection(collection: ModCollection): Promise<boolean> {
		return this.invokeElectron('updateCollection', collection);
	}

	deleteCollection(collection: string): Promise<boolean> {
		return this.invokeElectron('deleteCollection', collection);
	}

	renameCollection(collection: ModCollection, newName: string): Promise<boolean> {
		return this.invokeElectron('renameCollection', collection, newName);
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

	readModMetadata(localDir: string | undefined, allKnownMods: Set<string>): Promise<SessionMods> {
		return this.invokeElectron('readModMetadata', localDir, [...allKnownMods]);
	}

	fetchWorkshopDependencies(workshopID: bigint): Promise<boolean> {
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

	openModContextMenu(record: ModData) {
		this.sendElectron('openModContextMenu', record);
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

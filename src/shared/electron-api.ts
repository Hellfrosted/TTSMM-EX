import type { AppConfig, ModCollection, ModData, SessionMods } from 'model';
import type { LogLevel, PathType, ProgressUpdatePayload, SteamworksStatus } from './ipc';

export type ElectronLogFunctions = {
	info: (message: unknown) => void;
	debug: (message: unknown) => void;
	warn: (message: unknown) => void;
	error: (message: unknown) => void;
	silly: (message: unknown) => void;
	verbose: (message: unknown) => void;
};

export type ElectronPlatform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';

export type Unsubscribe = () => void;
export type ProgressChangeCallback = (
	type: ProgressUpdatePayload['type'],
	progress: ProgressUpdatePayload['progress'],
	progressMessage: ProgressUpdatePayload['progressMessage']
) => void;

export interface ElectronApi {
	platform: ElectronPlatform;
	log: ElectronLogFunctions;
	updateLogLevel: (level: LogLevel) => void;
	getUserDataPath: () => Promise<string>;
	readConfig: () => Promise<AppConfig | null>;
	updateConfig: (config: AppConfig) => Promise<boolean>;
	readCollection: (collection: string) => Promise<ModCollection | null>;
	readCollectionsList: () => Promise<string[]>;
	updateCollection: (collection: ModCollection) => Promise<boolean>;
	renameCollection: (collection: ModCollection, newName: string) => Promise<boolean>;
	deleteCollection: (collection: string) => Promise<boolean>;
	pathExists: (targetPath: string, expectedType?: PathType) => Promise<boolean>;
	discoverGameExecutable: () => Promise<string | null>;
	selectPath: (directory: boolean, title: string) => Promise<string | null>;
	launchGame: (gameExec: string, workshopID: string | bigint | null, closeOnLaunch: boolean, args: string[]) => Promise<boolean>;
	isGameRunning: () => Promise<boolean>;
	readModMetadata: (localDir: string | undefined, allKnownMods: string[]) => Promise<SessionMods>;
	fetchWorkshopDependencies: (workshopID: bigint) => Promise<boolean>;
	steamworksInited: () => Promise<SteamworksStatus>;
	downloadMod: (workshopID: bigint) => Promise<boolean>;
	subscribeMod: (workshopID: bigint) => Promise<boolean>;
	unsubscribeMod: (workshopID: bigint) => Promise<boolean>;
	openModBrowser: (workshopID: bigint) => void;
	openModSteam: (workshopID: bigint) => void;
	openModContextMenu: (record: ModData) => void;
	onProgressChange: (callback: ProgressChangeCallback) => Unsubscribe;
	onModMetadataUpdate: (callback: (uid: string, update: Partial<ModData>) => void) => Unsubscribe;
	onModRefreshRequested: (callback: () => void) => Unsubscribe;
	onReloadSteamworks: (callback: () => void) => Unsubscribe;
}

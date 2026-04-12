import { AppConfig } from './AppConfig';
import { ModCollection } from './ModCollection';
import { SessionMods } from './SessionMods';

export interface AppState {
	config: AppConfig;
	userDataPath: string;
	mods: SessionMods;
	allCollections: Map<string, ModCollection>;
	allCollectionNames: Set<string>;
	activeCollection?: ModCollection;
	firstModLoad?: boolean;
	sidebarCollapsed: boolean;
	launchingGame?: boolean;

	// General initialization
	initializedConfigs?: boolean; // Did we go load configs yet?
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	updateState: (props: any) => void;
	navigate: (path: string) => void;

	// Settings
	savingConfig: boolean;
	madeConfigEdits?: boolean;
	configErrors: { [field: string]: string };

	//
	loadingMods?: boolean;
	forceReloadMods?: boolean;
}

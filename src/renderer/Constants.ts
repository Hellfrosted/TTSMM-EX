import type { AppConfig } from 'model/AppConfig';

const { platform } = window.electron;
const DEFAULT_WORKSHOP_ID = BigInt(2790161231);
export const TT_APP_ID = '285920';

function getDefaultExecutablePath(): string {
	switch (platform) {
		case 'win32':
			return `C:\\Program Files (x86)\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe`;
		case 'darwin':
			return `~/Library/Application Support/Steam/steamapps/common/TerraTech/TerraTechOSX64.app`;
		default:
			return '';
	}
}
const DEFAULT_GAME_EXEC = getDefaultExecutablePath();

export const DEFAULT_CONFIG: AppConfig = {
	gameExec: DEFAULT_GAME_EXEC,
	workshopID: DEFAULT_WORKSHOP_ID,

	logsDir: '',

	closeOnLaunch: false,
	language: 'english',
	activeCollection: undefined,
	steamMaxConcurrency: 5,

	currentPath: '/collections/main',

	viewConfigs: {},

	ignoredValidationErrors: new Map(),

	userOverrides: new Map()
};

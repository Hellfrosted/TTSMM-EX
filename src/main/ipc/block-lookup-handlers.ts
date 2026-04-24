import { IpcMain } from 'electron';
import { BlockLookupBuildRequest, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { ValidChannel } from '../../model';
import {
	autoDetectBlockLookupWorkshopRoot,
	buildBlockLookupIndex,
	getBlockLookupStats,
	readBlockLookupSettings,
	searchBlockLookupIndex,
	writeBlockLookupSettings
} from '../block-lookup';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerBlockLookupHandlers(ipcMain: IpcMain, userDataPathProvider: UserDataPathProvider) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, async () => readBlockLookupSettings(getUserDataPath()));

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, async (_event, settings: BlockLookupSettings) =>
		writeBlockLookupSettings(getUserDataPath(), settings)
	);

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, async (_event, request: BlockLookupBuildRequest) =>
		buildBlockLookupIndex(getUserDataPath(), request)
	);

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SEARCH, async (_event, request: BlockLookupSearchRequest) =>
		searchBlockLookupIndex(getUserDataPath(), request.query, request.limit)
	);

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_STATS, async () => getBlockLookupStats(getUserDataPath()));

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, async (_event, request: BlockLookupBuildRequest) =>
		autoDetectBlockLookupWorkshopRoot(request)
	);
}

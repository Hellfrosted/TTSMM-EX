import type { IpcMain } from 'electron';
import type { BlockLookupBuildRequest, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { ValidChannel } from '../../model';
import {
	autoDetectBlockLookupWorkshopRoot,
	buildBlockLookupIndex,
	getBlockLookupStats,
	readBlockLookupSettings,
	searchBlockLookupIndex,
	writeBlockLookupSettings
} from '../block-lookup';
import {
	parseBlockLookupBuildRequestPayload,
	parseBlockLookupSearchRequestPayload,
	parseBlockLookupSettingsPayload
} from './block-lookup-validation';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerBlockLookupHandlers(ipcMain: IpcMain, userDataPathProvider: UserDataPathProvider) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, async () => readBlockLookupSettings(getUserDataPath()));

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, async (_event, settings: BlockLookupSettings) =>
		writeBlockLookupSettings(getUserDataPath(), parseBlockLookupSettingsPayload(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, settings))
	);

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, async (_event, request: BlockLookupBuildRequest) =>
		buildBlockLookupIndex(getUserDataPath(), parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, request))
	);

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SEARCH, async (_event, request: BlockLookupSearchRequest) => {
		const validatedRequest = parseBlockLookupSearchRequestPayload(ValidChannel.BLOCK_LOOKUP_SEARCH, request);
		return searchBlockLookupIndex(getUserDataPath(), validatedRequest.query, validatedRequest.limit);
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_STATS, async () => getBlockLookupStats(getUserDataPath()));

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, async (_event, request: BlockLookupBuildRequest) =>
		autoDetectBlockLookupWorkshopRoot(parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, request))
	);
}

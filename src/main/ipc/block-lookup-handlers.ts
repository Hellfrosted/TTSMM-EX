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
import { assertValidIpcSender } from './ipc-sender-validation';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerBlockLookupHandlers(ipcMain: IpcMain, userDataPathProvider: UserDataPathProvider) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, async (event) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, event);
		return readBlockLookupSettings(getUserDataPath());
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, async (event, settings: BlockLookupSettings) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, event);
		return writeBlockLookupSettings(getUserDataPath(), parseBlockLookupSettingsPayload(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, settings));
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, async (event, request: BlockLookupBuildRequest) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, event);
		return buildBlockLookupIndex(getUserDataPath(), parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, request));
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SEARCH, async (event, request: BlockLookupSearchRequest) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_SEARCH, event);
		const validatedRequest = parseBlockLookupSearchRequestPayload(ValidChannel.BLOCK_LOOKUP_SEARCH, request);
		return searchBlockLookupIndex(getUserDataPath(), validatedRequest.query, validatedRequest.limit);
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_STATS, async (event) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_STATS, event);
		return getBlockLookupStats(getUserDataPath());
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, async (event, request: BlockLookupBuildRequest) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, event);
		return autoDetectBlockLookupWorkshopRoot(
			parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, request)
		);
	});
}

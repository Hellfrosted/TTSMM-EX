import type { IpcMain } from 'electron';
import type { BlockLookupBuildRequest, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { ValidChannel } from '../../model';
import { createBlockLookupIndexer } from '../block-lookup-indexer';
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
	const getIndexer = () => createBlockLookupIndexer(userDataPathProvider.getUserDataPath());

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, async (event) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, event);
		return getIndexer().readSettings();
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, async (event, settings: BlockLookupSettings) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, event);
		return getIndexer().saveSettings(parseBlockLookupSettingsPayload(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, settings));
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, async (event, request: BlockLookupBuildRequest) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, event);
		return getIndexer().buildIndex(parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, request));
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_SEARCH, async (event, request: BlockLookupSearchRequest) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_SEARCH, event);
		const validatedRequest = parseBlockLookupSearchRequestPayload(ValidChannel.BLOCK_LOOKUP_SEARCH, request);
		return getIndexer().search(validatedRequest);
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_STATS, async (event) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_STATS, event);
		return getIndexer().getStats();
	});

	ipcMain.handle(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, async (event, request: BlockLookupBuildRequest) => {
		assertValidIpcSender(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, event);
		return getIndexer().autoDetectWorkshopRoot(
			parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, request)
		);
	});
}

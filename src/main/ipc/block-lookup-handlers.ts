import type { IpcMain } from 'electron';
import type { BlockLookupBuildRequest, BlockLookupIndexProgress, BlockLookupSearchRequest, BlockLookupSettings } from 'shared/block-lookup';
import { ValidChannel } from '../../model';
import { createBlockLookupIndexModule, type BlockLookupIndexModule } from '../block-lookup-indexer';
import { runMain } from '../runtime';
import {
	parseBlockLookupBuildRequestPayload,
	parseBlockLookupSearchRequestPayload,
	parseBlockLookupSettingsPayload
} from './block-lookup-validation';
import { registerValidatedIpcHandler } from './ipc-handler';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

function sendBlockLookupIndexProgress(event: { sender?: { send?: (channel: ValidChannel, progress: BlockLookupIndexProgress) => void } }) {
	return (progress: BlockLookupIndexProgress) => {
		event.sender?.send?.(ValidChannel.BLOCK_LOOKUP_INDEX_PROGRESS, progress);
	};
}

export function registerBlockLookupHandlers(ipcMain: IpcMain, userDataPathProvider: UserDataPathProvider) {
	const indexModulesByUserDataPath = new Map<string, BlockLookupIndexModule>();
	const getIndexModule = () => {
		const userDataPath = userDataPathProvider.getUserDataPath();
		let indexModule = indexModulesByUserDataPath.get(userDataPath);
		if (!indexModule) {
			indexModule = createBlockLookupIndexModule(userDataPath);
			indexModulesByUserDataPath.set(userDataPath, indexModule);
		}
		return indexModule;
	};

	registerValidatedIpcHandler(ipcMain, ValidChannel.BLOCK_LOOKUP_READ_SETTINGS, async () => {
		return getIndexModule().readSettings();
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, async (_event, settings: BlockLookupSettings) => {
		return getIndexModule().saveSettings(parseBlockLookupSettingsPayload(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, settings));
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, async (event, request: BlockLookupBuildRequest) => {
		return runMain(
			getIndexModule().buildIndex(
				parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, request),
				sendBlockLookupIndexProgress(event)
			)
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.BLOCK_LOOKUP_SEARCH, async (_event, request: BlockLookupSearchRequest) => {
		const validatedRequest = parseBlockLookupSearchRequestPayload(ValidChannel.BLOCK_LOOKUP_SEARCH, request);
		return getIndexModule().search(validatedRequest);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.BLOCK_LOOKUP_STATS, async () => {
		return getIndexModule().getStats();
	});

	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT,
		async (_event, request: BlockLookupBuildRequest) => {
			return getIndexModule().autoDetectWorkshopRoot(
				parseBlockLookupBuildRequestPayload(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, request)
			);
		}
	);
}

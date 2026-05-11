import type { IpcMain } from 'electron';
import { app } from 'electron';

import { ValidChannel } from '../../model';
import { saveExistingCollectionContent } from '../collection-content-save';
import { runCollectionLifecycle } from '../collection-lifecycle-service';
import { listCollections, readCollectionFile } from '../collection-store';
import { runMain } from '../runtime';
import { resolveStartupCollection } from '../startup-collection-resolution';
import {
	parseCollectionContentSaveRequest,
	parseCollectionNamePayload,
	parseCreateCollectionLifecycleRequest,
	parseDeleteCollectionLifecycleRequest,
	parseDuplicateCollectionLifecycleRequest,
	parseRenameCollectionLifecycleRequest,
	parseStartupCollectionResolutionRequest,
	parseSwitchCollectionLifecycleRequest
} from './collection-validation';
import { registerValidatedIpcHandler } from './ipc-handler';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerCollectionHandlers(
	ipcMain: IpcMain,
	userDataPathProvider: UserDataPathProvider = {
		getUserDataPath: () => app.getPath('userData')
	}
) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	registerValidatedIpcHandler(ipcMain, ValidChannel.READ_COLLECTION, async (_event, collection: string) => {
		return readCollectionFile(getUserDataPath(), parseCollectionNamePayload(ValidChannel.READ_COLLECTION, collection));
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.READ_COLLECTIONS, async () => {
		return listCollections(getUserDataPath());
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.UPDATE_COLLECTION, async (_event, request: unknown) => {
		return runMain(
			saveExistingCollectionContent(getUserDataPath(), parseCollectionContentSaveRequest(ValidChannel.UPDATE_COLLECTION, request))
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.CREATE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return runMain(
			runCollectionLifecycle(getUserDataPath(), {
				type: 'create',
				request: parseCreateCollectionLifecycleRequest(ValidChannel.CREATE_COLLECTION_LIFECYCLE, request)
			})
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DUPLICATE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return runMain(
			runCollectionLifecycle(getUserDataPath(), {
				type: 'duplicate',
				request: parseDuplicateCollectionLifecycleRequest(ValidChannel.DUPLICATE_COLLECTION_LIFECYCLE, request)
			})
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.RENAME_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return runMain(
			runCollectionLifecycle(getUserDataPath(), {
				type: 'rename',
				request: parseRenameCollectionLifecycleRequest(ValidChannel.RENAME_COLLECTION_LIFECYCLE, request)
			})
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DELETE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return runMain(
			runCollectionLifecycle(getUserDataPath(), {
				type: 'delete',
				request: parseDeleteCollectionLifecycleRequest(ValidChannel.DELETE_COLLECTION_LIFECYCLE, request)
			})
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.SWITCH_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return runMain(
			runCollectionLifecycle(getUserDataPath(), {
				type: 'switch',
				request: parseSwitchCollectionLifecycleRequest(ValidChannel.SWITCH_COLLECTION_LIFECYCLE, request)
			})
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.RESOLVE_STARTUP_COLLECTION, async (_event, request: unknown) => {
		const startupRequest = parseStartupCollectionResolutionRequest(ValidChannel.RESOLVE_STARTUP_COLLECTION, request);
		return runMain(resolveStartupCollection(getUserDataPath(), startupRequest.config));
	});
}

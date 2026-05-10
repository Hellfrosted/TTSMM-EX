import { app } from 'electron';
import type { IpcMain } from 'electron';

import { ValidChannel } from '../../model';
import {
	createAndActivateCollection,
	deleteActiveCollection,
	duplicateAndActivateCollection,
	renameActiveCollection,
	switchActiveCollection
} from '../collection-lifecycle-service';
import { saveExistingCollectionContent } from '../collection-content-save';
import { listCollections, readCollectionFile } from '../collection-store';
import {
	parseCollectionNamePayload,
	parseCollectionContentSaveRequest,
	parseCreateCollectionLifecycleRequest,
	parseDeleteCollectionLifecycleRequest,
	parseDuplicateCollectionLifecycleRequest,
	parseRenameCollectionLifecycleRequest,
	parseStartupCollectionResolutionRequest,
	parseSwitchCollectionLifecycleRequest
} from './collection-validation';
import { resolveStartupCollection } from '../startup-collection-resolution';
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
		return saveExistingCollectionContent(getUserDataPath(), parseCollectionContentSaveRequest(ValidChannel.UPDATE_COLLECTION, request));
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.CREATE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return createAndActivateCollection(
			getUserDataPath(),
			parseCreateCollectionLifecycleRequest(ValidChannel.CREATE_COLLECTION_LIFECYCLE, request)
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DUPLICATE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return duplicateAndActivateCollection(
			getUserDataPath(),
			parseDuplicateCollectionLifecycleRequest(ValidChannel.DUPLICATE_COLLECTION_LIFECYCLE, request)
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.RENAME_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return renameActiveCollection(
			getUserDataPath(),
			parseRenameCollectionLifecycleRequest(ValidChannel.RENAME_COLLECTION_LIFECYCLE, request)
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DELETE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return deleteActiveCollection(
			getUserDataPath(),
			parseDeleteCollectionLifecycleRequest(ValidChannel.DELETE_COLLECTION_LIFECYCLE, request)
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.SWITCH_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		return switchActiveCollection(
			getUserDataPath(),
			parseSwitchCollectionLifecycleRequest(ValidChannel.SWITCH_COLLECTION_LIFECYCLE, request)
		);
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.RESOLVE_STARTUP_COLLECTION, async (_event, request: unknown) => {
		const startupRequest = parseStartupCollectionResolutionRequest(ValidChannel.RESOLVE_STARTUP_COLLECTION, request);
		return resolveStartupCollection(getUserDataPath(), startupRequest.config);
	});
}

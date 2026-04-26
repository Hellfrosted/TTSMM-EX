import { app } from 'electron';
import type { IpcMain } from 'electron';

import { ModCollection, ValidChannel } from '../../model';
import { deleteCollectionFile, listCollections, readCollectionFile, renameCollectionFile, updateCollectionFile } from '../collection-store';
import { parseCollectionNamePayload, parseModCollectionPayload } from './collection-validation';
import { assertValidIpcSender } from './ipc-sender-validation';

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

	ipcMain.handle(ValidChannel.READ_COLLECTION, async (event, collection: string) => {
		assertValidIpcSender(ValidChannel.READ_COLLECTION, event);
		return readCollectionFile(getUserDataPath(), parseCollectionNamePayload(ValidChannel.READ_COLLECTION, collection));
	});

	ipcMain.handle(ValidChannel.READ_COLLECTIONS, async (event) => {
		assertValidIpcSender(ValidChannel.READ_COLLECTIONS, event);
		return listCollections(getUserDataPath());
	});

	ipcMain.handle(ValidChannel.UPDATE_COLLECTION, async (event, collection: ModCollection) => {
		assertValidIpcSender(ValidChannel.UPDATE_COLLECTION, event);
		return updateCollectionFile(getUserDataPath(), parseModCollectionPayload(ValidChannel.UPDATE_COLLECTION, collection));
	});

	ipcMain.handle(ValidChannel.RENAME_COLLECTION, async (event, collection: ModCollection, newName: string) => {
		assertValidIpcSender(ValidChannel.RENAME_COLLECTION, event);
		return renameCollectionFile(
			getUserDataPath(),
			parseModCollectionPayload(ValidChannel.RENAME_COLLECTION, collection),
			parseCollectionNamePayload(ValidChannel.RENAME_COLLECTION, newName)
		);
	});

	ipcMain.handle(ValidChannel.DELETE_COLLECTION, async (event, collection: string) => {
		assertValidIpcSender(ValidChannel.DELETE_COLLECTION, event);
		return deleteCollectionFile(getUserDataPath(), parseCollectionNamePayload(ValidChannel.DELETE_COLLECTION, collection));
	});
}

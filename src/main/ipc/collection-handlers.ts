import { app, IpcMain } from 'electron';

import { ModCollection, ValidChannel } from '../../model';
import type { CollectionLifecycleCommand } from '../../shared/ipc';
import { executeCollectionLifecycleCommand, listCollections, readCollectionFile, updateCollectionFile } from '../collection-lifecycle';

export function registerCollectionHandlers(ipcMain: IpcMain) {
	ipcMain.handle(ValidChannel.READ_COLLECTION, async (_event, collection: string) => {
		return readCollectionFile(app.getPath('userData'), collection);
	});

	ipcMain.handle(ValidChannel.READ_COLLECTIONS, async () => {
		return listCollections(app.getPath('userData'));
	});

	ipcMain.handle(ValidChannel.UPDATE_COLLECTION, async (_event, collection: ModCollection) => {
		return updateCollectionFile(app.getPath('userData'), collection);
	});

	ipcMain.handle(ValidChannel.COLLECTION_LIFECYCLE_COMMAND, async (_event, command: CollectionLifecycleCommand) => {
		return executeCollectionLifecycleCommand(app.getPath('userData'), command);
	});
}

import type { IpcMain } from 'electron';
import { ValidChannel } from '../../model';
import {
	addStablePopulationEntry,
	createWorkshopPopulationRequest,
	disablePopulationEntry,
	restorePopulationEntry,
	scanPopulationPool
} from '../population-pool';
import { registerValidatedIpcHandler } from './ipc-handler';
import { parsePopulationFileOperation, parsePopulationScan, parsePopulationWorkshopRequest } from './population-pool-validation';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerPopulationPoolHandlers(ipcMain: IpcMain, userDataPathProvider: UserDataPathProvider) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	registerValidatedIpcHandler(ipcMain, ValidChannel.POPULATION_POOL_SCAN, async (_event, request: unknown) => {
		return scanPopulationPool(getUserDataPath(), parsePopulationScan(ValidChannel.POPULATION_POOL_SCAN, request));
	});
	registerValidatedIpcHandler(ipcMain, ValidChannel.POPULATION_POOL_DISABLE, async (_event, request: unknown) => {
		return disablePopulationEntry(getUserDataPath(), parsePopulationFileOperation(ValidChannel.POPULATION_POOL_DISABLE, request));
	});
	registerValidatedIpcHandler(ipcMain, ValidChannel.POPULATION_POOL_RESTORE, async (_event, request: unknown) => {
		return restorePopulationEntry(getUserDataPath(), parsePopulationFileOperation(ValidChannel.POPULATION_POOL_RESTORE, request));
	});
	registerValidatedIpcHandler(ipcMain, ValidChannel.POPULATION_POOL_STABLE_ADD, async (_event, request: unknown) => {
		return addStablePopulationEntry(getUserDataPath(), parsePopulationFileOperation(ValidChannel.POPULATION_POOL_STABLE_ADD, request));
	});
	registerValidatedIpcHandler(ipcMain, ValidChannel.POPULATION_POOL_CREATE_WORKSHOP_REQUEST, async (_event, request: unknown) => {
		return createWorkshopPopulationRequest(
			getUserDataPath(),
			parsePopulationWorkshopRequest(ValidChannel.POPULATION_POOL_CREATE_WORKSHOP_REQUEST, request)
		);
	});
}

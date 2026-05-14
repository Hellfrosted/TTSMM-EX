import type { IpcMain } from 'electron';
import type {
	PopulationPoolCreateWorkshopRequest,
	PopulationPoolFileOperationRequest,
	PopulationPoolScanRequest
} from 'shared/population-pool';
import { ValidChannel } from '../../model';
import {
	addStablePopulationEntry,
	createWorkshopPopulationRequest,
	disablePopulationEntry,
	restorePopulationEntry,
	scanPopulationPool
} from '../population-pool';
import { registerValidatedIpcHandler } from './ipc-handler';

interface UserDataPathProvider {
	getUserDataPath: () => string;
}

export function registerPopulationPoolHandlers(ipcMain: IpcMain, userDataPathProvider: UserDataPathProvider) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	registerValidatedIpcHandler(ipcMain, ValidChannel.POPULATION_POOL_SCAN, async (_event, request: PopulationPoolScanRequest) => {
		return scanPopulationPool(getUserDataPath(), request);
	});
	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.POPULATION_POOL_DISABLE,
		async (_event, request: PopulationPoolFileOperationRequest) => {
			return disablePopulationEntry(getUserDataPath(), request);
		}
	);
	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.POPULATION_POOL_RESTORE,
		async (_event, request: PopulationPoolFileOperationRequest) => {
			return restorePopulationEntry(getUserDataPath(), request);
		}
	);
	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.POPULATION_POOL_STABLE_ADD,
		async (_event, request: PopulationPoolFileOperationRequest) => {
			return addStablePopulationEntry(getUserDataPath(), request);
		}
	);
	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.POPULATION_POOL_CREATE_WORKSHOP_REQUEST,
		async (_event, request: PopulationPoolCreateWorkshopRequest) => {
			return createWorkshopPopulationRequest(getUserDataPath(), request);
		}
	);
}

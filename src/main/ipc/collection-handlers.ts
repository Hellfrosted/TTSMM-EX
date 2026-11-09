import type { IpcMain } from 'electron';
import { app } from 'electron';

import { ValidChannel } from '../../model';
import type { CollectionLifecycleResult } from '../../shared/collection-lifecycle';
import { saveExistingCollectionContent } from '../collection-content-save';
import {
	beginCollectionLifecycleJournal,
	clearCollectionLifecycleJournal,
	recoverCollectionLifecycleJournal
} from '../collection-lifecycle-journal';
import { type CollectionLifecycleCommand, runCollectionLifecycle } from '../collection-lifecycle-service';
import { listCollectionsEffect, readCollectionFileEffect } from '../collection-store';
import { configFilePath, readConfigFileEffect } from '../config-store';
import { runConfigTransaction } from '../config-transaction';
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
	const runAuthoritativeLifecycle = (userDataPath: string, command: CollectionLifecycleCommand) =>
		runConfigTransaction(userDataPath, async () => {
			const stored = await runMain(readConfigFileEffect(configFilePath(userDataPath), false));
			if (!stored) {
				return {
					ok: false as const,
					code: 'missing-active-collection' as const,
					message: 'The saved configuration is unavailable. Reload before trying again.'
				};
			}
			{
				const expected = command.request.config.activeCollection;
				const actual = stored.activeCollection;
				if (expected !== actual) {
					return {
						ok: false as const,
						code: 'stale-active-collection' as const,
						message: 'The active collection changed. Reload before trying again.'
					};
				}
			}
			const names = [stored.activeCollection, 'default', 'name' in command.request ? command.request.name : undefined].filter(
				(name): name is string => typeof name === 'string'
			);
			beginCollectionLifecycleJournal(userDataPath, names);
			let result: CollectionLifecycleResult;
			try {
				result = await runMain(
					runCollectionLifecycle(userDataPath, {
						...command,
						request: { ...command.request, config: stored }
					} as CollectionLifecycleCommand)
				);
			} catch (error) {
				try {
					recoverCollectionLifecycleJournal(userDataPath);
				} catch (recoveryError) {
					throw new AggregateError([error, recoveryError], 'Collection lifecycle failed and recovery could not complete');
				}
				throw error;
			}
			if (result.ok) clearCollectionLifecycleJournal(userDataPath);
			else recoverCollectionLifecycleJournal(userDataPath);
			return result;
		});

	registerValidatedIpcHandler(ipcMain, ValidChannel.READ_COLLECTION, (_event, collection: string) => {
		const userDataPath = getUserDataPath();
		const name = parseCollectionNamePayload(ValidChannel.READ_COLLECTION, collection);
		return runConfigTransaction(userDataPath, () => runMain(readCollectionFileEffect(userDataPath, name)));
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.READ_COLLECTIONS, () => {
		const userDataPath = getUserDataPath();
		return runConfigTransaction(userDataPath, () => runMain(listCollectionsEffect(userDataPath)));
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.UPDATE_COLLECTION, (_event, request: unknown) => {
		const userDataPath = getUserDataPath();
		const parsed = parseCollectionContentSaveRequest(ValidChannel.UPDATE_COLLECTION, request);
		return runConfigTransaction(userDataPath, async () => {
			const config = await runMain(readConfigFileEffect(configFilePath(userDataPath), false));
			if (!config || config.activeCollection !== parsed.collectionName) {
				return {
					ok: false as const,
					code: 'stale-active-collection' as const,
					message: 'The active collection changed. Reload before saving.'
				};
			}
			return runMain(saveExistingCollectionContent(userDataPath, parsed));
		});
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.CREATE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		const userDataPath = getUserDataPath();
		return runAuthoritativeLifecycle(userDataPath, {
			type: 'create',
			request: parseCreateCollectionLifecycleRequest(ValidChannel.CREATE_COLLECTION_LIFECYCLE, request)
		});
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DUPLICATE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		const userDataPath = getUserDataPath();
		return runAuthoritativeLifecycle(userDataPath, {
			type: 'duplicate',
			request: parseDuplicateCollectionLifecycleRequest(ValidChannel.DUPLICATE_COLLECTION_LIFECYCLE, request)
		});
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.RENAME_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		const userDataPath = getUserDataPath();
		return runAuthoritativeLifecycle(userDataPath, {
			type: 'rename',
			request: parseRenameCollectionLifecycleRequest(ValidChannel.RENAME_COLLECTION_LIFECYCLE, request)
		});
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.DELETE_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		const userDataPath = getUserDataPath();
		return runAuthoritativeLifecycle(userDataPath, {
			type: 'delete',
			request: parseDeleteCollectionLifecycleRequest(ValidChannel.DELETE_COLLECTION_LIFECYCLE, request)
		});
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.SWITCH_COLLECTION_LIFECYCLE, async (_event, request: unknown) => {
		const userDataPath = getUserDataPath();
		return runAuthoritativeLifecycle(userDataPath, {
			type: 'switch',
			request: parseSwitchCollectionLifecycleRequest(ValidChannel.SWITCH_COLLECTION_LIFECYCLE, request)
		});
	});

	registerValidatedIpcHandler(ipcMain, ValidChannel.RESOLVE_STARTUP_COLLECTION, async (_event, request: unknown) => {
		const startupRequest = parseStartupCollectionResolutionRequest(ValidChannel.RESOLVE_STARTUP_COLLECTION, request);
		const userDataPath = getUserDataPath();
		return runConfigTransaction(userDataPath, async () => {
			const stored = await runMain(readConfigFileEffect(configFilePath(userDataPath), false));
			return runMain(resolveStartupCollection(userDataPath, stored ?? startupRequest.config));
		});
	});
}

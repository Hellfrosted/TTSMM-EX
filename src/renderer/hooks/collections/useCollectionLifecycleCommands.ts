import { startTransition, useCallback } from 'react';
import { AppConfig, ModCollection, type NotificationProps } from 'model';
import api from 'renderer/Api';
import {
	collectionWorkspaceSnapshot,
	deleteActiveCollectionSnapshot,
	renameActiveCollectionSnapshot,
	switchActiveCollectionSnapshot
} from 'renderer/collection-lifecycle';
import {
	runCreateCollectionTransaction,
	runDuplicateCollectionTransaction,
	type NewCollectionTransactionResult
} from 'renderer/collection-lifecycle-transactions';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { writeConfig } from 'renderer/util/config-write';
import { validateCollectionName } from 'shared/collection-name';
import type { NotificationType } from './useNotifications';
import { cloneCollection } from './utils';

interface UseCollectionLifecycleCommandsOptions {
	appState: CollectionWorkspaceAppState;
	deleteCollectionFile: (collectionName: string) => Promise<boolean>;
	madeEdits: boolean;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	persistCollectionFile: (collection: ModCollection) => Promise<boolean>;
	rawPersistCollection: (collection: ModCollection) => Promise<boolean>;
	renameCollectionFile: (collection: ModCollection, newName: string) => Promise<boolean>;
	resetValidationState: () => void;
	runQueuedCollectionWrite: <T>(operation: () => Promise<T>) => Promise<T>;
	setMadeEdits: (madeEdits: boolean) => void;
	setSavingCollection: (savingCollection: boolean) => void;
}

export function useCollectionLifecycleCommands({
	appState,
	deleteCollectionFile,
	madeEdits,
	openNotification,
	persistCollectionFile,
	rawPersistCollection,
	renameCollectionFile,
	resetValidationState,
	runQueuedCollectionWrite,
	setMadeEdits,
	setSavingCollection
}: UseCollectionLifecycleCommandsOptions) {
	const { updateState } = appState;

	const commitCollectionState = useCallback(
		(
			nextCollections: Map<string, ModCollection>,
			nextCollectionNames: Set<string>,
			nextActiveCollection: ModCollection | undefined,
			nextConfig: AppConfig
		) => {
			startTransition(() => {
				updateState({
					allCollections: nextCollections,
					allCollectionNames: nextCollectionNames,
					activeCollection: nextActiveCollection,
					config: nextConfig
				});
			});
		},
		[updateState]
	);

	const validateCollectionNameOrNotify = useCallback(
		(name: string) => {
			const validationError = validateCollectionName(name);
			if (validationError) {
				openNotification(
					{
						message: validationError,
						placement: 'bottomRight',
						duration: null
					},
					'error'
				);
				return false;
			}

			return true;
		},
		[openNotification]
	);

	const reportConfigPersistenceFailure = useCallback(
		(error: unknown, message = 'Failed to update config') => {
			api.logger.error(error);
			openNotification(
				{
					message,
					placement: 'bottomLeft',
					duration: null
				},
				'error'
			);
		},
		[openNotification]
	);

	const persistConfigAndReportFailure = useCallback(
		async (nextConfig: AppConfig, message = 'Failed to update config') => {
			try {
				await writeConfig(nextConfig);
				return true;
			} catch (error) {
				reportConfigPersistenceFailure(error, message);
				return false;
			}
		},
		[reportConfigPersistenceFailure]
	);

	const notifyRollbackFailure = useCallback(
		(message: string) => {
			openNotification(
				{
					message,
					placement: 'bottomLeft',
					duration: null
				},
				'error'
			);
		},
		[openNotification]
	);

	const reportNewCollectionTransactionFailure = useCallback(
		(
			transactionResult: NewCollectionTransactionResult,
			messages: {
				newCollectionWriteFailed: string;
				configWriteFailed: string;
				rollbackFailed: string;
			}
		) => {
			if (transactionResult.committed) {
				return false;
			}

			if (transactionResult.failureReason === 'new-collection-write-failed') {
				openNotification(
					{
						message: messages.newCollectionWriteFailed,
						placement: 'bottomRight',
						duration: null
					},
					'error'
				);
			}

			if (transactionResult.failureReason === 'config-write-failed') {
				reportConfigPersistenceFailure(transactionResult.error, messages.configWriteFailed);
				if (transactionResult.rollbackFailed) {
					notifyRollbackFailure(messages.rollbackFailed);
				}
			}

			return true;
		},
		[notifyRollbackFailure, openNotification, reportConfigPersistenceFailure]
	);

	const createNewCollection = useCallback(
		async (name: string, mods?: string[]) => {
			if (!validateCollectionNameOrNotify(name)) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				const { activeCollection } = appState;
				let savingStarted = false;

				try {
					const transactionResult = await runCreateCollectionTransaction({
						snapshot: collectionWorkspaceSnapshot(appState),
						name,
						mods: mods || [],
						dirtyCollection: madeEdits ? activeCollection : undefined,
						persistDirtyCollection: rawPersistCollection,
						updateCollection: persistCollectionFile,
						deleteCollection: deleteCollectionFile,
						writeConfig,
						onBeforeNewCollectionWrite: () => {
							savingStarted = true;
							setSavingCollection(true);
						}
					});
					if (
						reportNewCollectionTransactionFailure(transactionResult, {
							newCollectionWriteFailed: `Failed to create new collection ${name}`,
							configWriteFailed: `Created collection ${name} but failed to activate it`,
							rollbackFailed: `Failed to roll back collection ${name} after the config update failed`
						})
					) {
						return;
					}

					const { lifecycleResult } = transactionResult;
					if (!lifecycleResult) {
						return;
					}
					commitCollectionState(
						lifecycleResult.allCollections,
						lifecycleResult.allCollectionNames,
						lifecycleResult.activeCollection,
						lifecycleResult.config
					);
					setMadeEdits(false);
					openNotification(
						{
							message: `Created new collection ${name}`,
							placement: 'bottomRight',
							duration: 1
						},
						'success'
					);
				} catch (error) {
					api.logger.error(error);
					openNotification(
						{
							message: `Failed to create new collection ${name}`,
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
				} finally {
					if (savingStarted) {
						setSavingCollection(false);
					}
				}
			});
		},
		[
			appState,
			commitCollectionState,
			deleteCollectionFile,
			madeEdits,
			openNotification,
			persistCollectionFile,
			rawPersistCollection,
			reportNewCollectionTransactionFailure,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection,
			validateCollectionNameOrNotify
		]
	);

	const duplicateCollection = useCallback(
		async (name: string) => {
			if (!validateCollectionNameOrNotify(name)) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				const { activeCollection } = appState;
				if (!activeCollection) {
					return;
				}

				const oldName = activeCollection.name;
				let savingStarted = false;

				try {
					const transactionResult = await runDuplicateCollectionTransaction({
						snapshot: collectionWorkspaceSnapshot(appState),
						name,
						dirtyCollection: madeEdits ? activeCollection : undefined,
						persistDirtyCollection: rawPersistCollection,
						updateCollection: persistCollectionFile,
						deleteCollection: deleteCollectionFile,
						writeConfig,
						onBeforeNewCollectionWrite: () => {
							savingStarted = true;
							setSavingCollection(true);
						}
					});
					if (
						reportNewCollectionTransactionFailure(transactionResult, {
							newCollectionWriteFailed: `Failed to create new collection ${name}`,
							configWriteFailed: `Duplicated collection ${oldName} but failed to activate ${name}`,
							rollbackFailed: `Failed to roll back duplicated collection ${name} after the config update failed`
						})
					) {
						return;
					}

					const { lifecycleResult } = transactionResult;
					if (!lifecycleResult) {
						return;
					}
					commitCollectionState(
						lifecycleResult.allCollections,
						lifecycleResult.allCollectionNames,
						lifecycleResult.activeCollection,
						lifecycleResult.config
					);
					setMadeEdits(false);
					openNotification(
						{
							message: `Duplicated collection ${oldName}`,
							placement: 'bottomRight',
							duration: 1
						},
						'success'
					);
				} catch (error) {
					api.logger.error(error);
					openNotification(
						{
							message: `Failed to duplicate collection ${oldName}`,
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
				} finally {
					if (savingStarted) {
						setSavingCollection(false);
					}
				}
			});
		},
		[
			appState,
			commitCollectionState,
			deleteCollectionFile,
			madeEdits,
			openNotification,
			persistCollectionFile,
			rawPersistCollection,
			reportNewCollectionTransactionFailure,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection,
			validateCollectionNameOrNotify
		]
	);

	const renameCollection = useCallback(
		async (name: string) => {
			if (!validateCollectionNameOrNotify(name)) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				const { activeCollection } = appState;
				if (!activeCollection) {
					return;
				}

				const oldName = activeCollection.name;
				setSavingCollection(true);

				try {
					const updateSuccess = await renameCollectionFile(activeCollection, name);
					if (!updateSuccess) {
						openNotification(
							{
								message: `Failed to rename collection ${oldName} to ${name}`,
								placement: 'bottomRight',
								duration: null
							},
							'error'
						);
						return;
					}

					const lifecycleResult = renameActiveCollectionSnapshot(collectionWorkspaceSnapshot(appState), name);
					if (!lifecycleResult) {
						return;
					}
					const renamedCollection = lifecycleResult.activeCollection;
					const configPersisted = await persistConfigAndReportFailure(
						lifecycleResult.config,
						`Renamed collection ${oldName} but failed to persist the active collection change`
					);
					if (!configPersisted) {
						const rolledBack = await renameCollectionFile(renamedCollection, oldName);
						if (!rolledBack) {
							notifyRollbackFailure(`Failed to restore collection ${oldName} after the config update failed`);
						}
						return;
					}

					commitCollectionState(
						lifecycleResult.allCollections,
						lifecycleResult.allCollectionNames,
						lifecycleResult.activeCollection,
						lifecycleResult.config
					);
					setMadeEdits(false);
					openNotification(
						{
							message: `Collection ${oldName} renamed to ${name}`,
							placement: 'bottomRight',
							duration: 1
						},
						'success'
					);
				} catch (error) {
					api.logger.error(error);
					openNotification(
						{
							message: `Failed to rename collection ${oldName} to ${name}`,
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
				} finally {
					setSavingCollection(false);
				}
			});
		},
		[
			appState,
			commitCollectionState,
			notifyRollbackFailure,
			openNotification,
			persistConfigAndReportFailure,
			renameCollectionFile,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection,
			validateCollectionNameOrNotify
		]
	);

	const deleteCollection = useCallback(async () => {
		await runQueuedCollectionWrite(async () => {
			const { activeCollection } = appState;
			if (!activeCollection) {
				return;
			}

			setSavingCollection(true);
			const { name } = activeCollection;
			const deletedCollection = cloneCollection(activeCollection);

			try {
				const deleteSuccess = await deleteCollectionFile(name);
				if (!deleteSuccess) {
					openNotification(
						{
							message: 'Failed to delete collection',
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
					return;
				}

				const lifecycleResult = deleteActiveCollectionSnapshot(collectionWorkspaceSnapshot(appState));
				if (!lifecycleResult) {
					return;
				}
				if (lifecycleResult.createdFallbackCollection) {
					const createdDefaultCollection = await rawPersistCollection(lifecycleResult.activeCollection);
					if (!createdDefaultCollection) {
						return;
					}
				}

				const configPersisted = await persistConfigAndReportFailure(
					lifecycleResult.config,
					`Deleted collection ${name} but failed to persist the replacement selection`
				);
				if (!configPersisted) {
					if (lifecycleResult.createdFallbackCollection) {
						const deletedFallbackCollection = await deleteCollectionFile(lifecycleResult.activeCollection.name);
						if (!deletedFallbackCollection) {
							notifyRollbackFailure(`Failed to remove the fallback collection after the config update failed`);
						}
					}
					const restoredCollection = await rawPersistCollection(deletedCollection);
					if (!restoredCollection) {
						notifyRollbackFailure(`Failed to restore collection ${name} after the config update failed`);
					}
					return;
				}

				commitCollectionState(
					lifecycleResult.allCollections,
					lifecycleResult.allCollectionNames,
					lifecycleResult.activeCollection,
					lifecycleResult.config
				);
				setMadeEdits(false);
				openNotification(
					{
						message: `Collection ${name} deleted`,
						placement: 'bottomRight',
						duration: 1
					},
					'success'
				);
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Failed to delete collection',
						placement: 'bottomRight',
						duration: null
					},
					'error'
				);
			} finally {
				setSavingCollection(false);
			}
		});
	}, [
		appState,
		commitCollectionState,
		deleteCollectionFile,
		notifyRollbackFailure,
		openNotification,
		persistConfigAndReportFailure,
		rawPersistCollection,
		runQueuedCollectionWrite,
		setMadeEdits,
		setSavingCollection
	]);

	const changeActiveCollection = useCallback(
		async (name: string) => {
			const lifecycleResult = switchActiveCollectionSnapshot(collectionWorkspaceSnapshot(appState), name);
			if (!lifecycleResult) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				const { activeCollection } = appState;
				setSavingCollection(true);
				try {
					if (madeEdits && activeCollection) {
						const persisted = await rawPersistCollection(activeCollection);
						if (!persisted) {
							return;
						}
					}

					const configPersisted = await persistConfigAndReportFailure(lifecycleResult.config, `Failed to switch to collection ${name}`);
					if (!configPersisted) {
						return;
					}

					resetValidationState();
					commitCollectionState(
						lifecycleResult.allCollections,
						lifecycleResult.allCollectionNames,
						lifecycleResult.activeCollection,
						lifecycleResult.config
					);
					setMadeEdits(false);
				} finally {
					setSavingCollection(false);
				}
			});
		},
		[
			appState,
			commitCollectionState,
			madeEdits,
			persistConfigAndReportFailure,
			rawPersistCollection,
			resetValidationState,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection
		]
	);

	const saveCollection = useCallback(
		async (collection: ModCollection, pureSave: boolean) => {
			await runQueuedCollectionWrite(async () => {
				setSavingCollection(true);
				try {
					const targetCollection = cloneCollection(collection);
					const writeSuccess = await persistCollectionFile(targetCollection);
					if (!writeSuccess) {
						openNotification(
							{
								message: `Failed to save collection ${targetCollection.name}`,
								placement: 'bottomRight',
								duration: null
							},
							'error'
						);
					} else {
						openNotification(
							{
								message: `Saved collection ${targetCollection.name}`,
								placement: 'bottomRight',
								duration: 1
							},
							'success'
						);
						if (pureSave) {
							setMadeEdits(false);
						}
					}
				} catch (error) {
					api.logger.error(error);
				} finally {
					setSavingCollection(false);
				}
			});
		},
		[openNotification, persistCollectionFile, runQueuedCollectionWrite, setMadeEdits, setSavingCollection]
	);

	return {
		changeActiveCollection,
		createNewCollection,
		deleteCollection,
		duplicateCollection,
		renameCollection,
		saveCollection
	};
}

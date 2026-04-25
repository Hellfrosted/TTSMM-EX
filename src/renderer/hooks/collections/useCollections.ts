import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { AppConfig, CollectionManagerModalType, ModCollection, ModData, ModType } from 'model';
import api from 'renderer/Api';
import type { NotificationProps } from 'model';
import { writeConfig } from 'renderer/util/config-write';
import { validateCollectionName } from 'shared/collection-name';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
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
import { getVisibleCollectionRows } from 'renderer/collection-mod-projection';
import type { NotificationType } from './useNotifications';
import { cloneCollection, copyCollectionsMap } from './utils';
import { markPerfInteraction, measurePerf } from 'renderer/perf';

interface UseCollectionsOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	cancelValidation: () => void;
	resetValidationState: () => void;
	validateActiveCollection: (launchIfValid: boolean) => Promise<void>;
	setModalType: (modalType: CollectionManagerModalType) => void;
}

export function useCollections({
	appState,
	openNotification,
	cancelValidation,
	resetValidationState,
	validateActiveCollection,
	setModalType
}: UseCollectionsOptions) {
	const [searchString, setSearchString] = useState('');
	const [filteredRows, setFilteredRows] = useState<ModData[]>();
	const [savingCollection, setSavingCollection] = useState(false);
	const [madeEdits, setMadeEdits] = useState(false);
	const collectionWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
	const pendingValidationRef = useRef<ModCollection | undefined>(undefined);
	const searchStringRef = useRef(searchString);
	const { activeCollection: currentActiveCollection, allCollectionNames, allCollections, config, updateState } = appState;

	useEffect(() => {
		searchStringRef.current = searchString;
	}, [searchString]);

	const getModManagerUID = useCallback(() => {
		return `${ModType.WORKSHOP}:${config.workshopID}`;
	}, [config.workshopID]);

	const hasSameSelectedMods = useCallback((selectedMods: string[], nextSelectedMods: string[]) => {
		return selectedMods.length === nextSelectedMods.length && selectedMods.every((uid, index) => uid === nextSelectedMods[index]);
	}, []);

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

	const runQueuedCollectionWrite = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
		const previousOperation = collectionWriteQueueRef.current;
		let releaseQueue: () => void = () => undefined;
		collectionWriteQueueRef.current = new Promise<void>((resolve) => {
			releaseQueue = resolve;
		});

		await previousOperation;
		try {
			return await operation();
		} finally {
			releaseQueue();
		}
	}, []);

	const rawPersistCollection = useCallback(
		async (collection: ModCollection) => {
			const targetCollection = cloneCollection(collection);
			const writeSuccess = await api.updateCollection(targetCollection);
			if (!writeSuccess) {
				openNotification(
					{
						message: `Failed to save collection ${targetCollection.name}`,
						placement: 'bottomRight',
						duration: null
					},
					'error'
				);
			}
			return writeSuccess;
		},
		[openNotification]
	);

	const persistCollection = useCallback(
		(collection: ModCollection) => {
			return runQueuedCollectionWrite(() => rawPersistCollection(collection));
		},
		[rawPersistCollection, runQueuedCollectionWrite]
	);

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

	const applyActiveCollection = useCallback(
		(nextCollection: ModCollection) => {
			const nextCollections = copyCollectionsMap(allCollections);
			nextCollections.set(nextCollection.name, nextCollection);
			commitCollectionState(nextCollections, allCollectionNames, nextCollection, config);
		},
		[allCollectionNames, allCollections, commitCollectionState, config]
	);

	const validateAfterCollectionEdit = useCallback(
		(nextCollection: ModCollection) => {
			cancelValidation();
			setMadeEdits(true);
			pendingValidationRef.current = nextCollection;
			applyActiveCollection(nextCollection);
		},
		[applyActiveCollection, cancelValidation]
	);

	useEffect(() => {
		const pendingValidation = pendingValidationRef.current;
		if (!pendingValidation || !currentActiveCollection) {
			return;
		}

		const matchesPendingCollection =
			currentActiveCollection.name === pendingValidation.name &&
			currentActiveCollection.mods.length === pendingValidation.mods.length &&
			currentActiveCollection.mods.every((uid, index) => uid === pendingValidation.mods[index]);
		if (!matchesPendingCollection) {
			return;
		}

		pendingValidationRef.current = undefined;
		void validateActiveCollection(false);
	}, [currentActiveCollection, validateActiveCollection]);

	const toggleMod = useCallback(
		(checked: boolean, uid: string) => {
			const { activeCollection } = appState;
			if (!activeCollection) {
				return;
			}

			const nextCollection = cloneCollection(activeCollection);
			let changed = false;
			if (checked) {
				if (!nextCollection.mods.includes(uid)) {
					nextCollection.mods.push(uid);
					changed = true;
				}
			} else if (uid !== getModManagerUID()) {
				nextCollection.mods = nextCollection.mods.filter((mod) => mod !== uid);
				changed = true;
			} else {
				setModalType(CollectionManagerModalType.DESELECTING_MOD_MANAGER);
			}

			if (changed) {
				validateAfterCollectionEdit(nextCollection);
			}
		},
		[appState, getModManagerUID, setModalType, validateAfterCollectionEdit]
	);

	const setEnabledMods = useCallback(
		(enabledMods: Set<string>) => {
			const { activeCollection } = appState;
			if (!activeCollection) {
				return;
			}

			const managerUID = getModManagerUID();
			enabledMods.add(managerUID);
			const nextSelectedMods = [...enabledMods].sort();
			if (hasSameSelectedMods(activeCollection.mods, nextSelectedMods)) {
				return;
			}

			validateAfterCollectionEdit({
				...cloneCollection(activeCollection),
				mods: nextSelectedMods
			});
		},
		[appState, getModManagerUID, hasSameSelectedMods, validateAfterCollectionEdit]
	);

	const setModSubset = useCallback(
		(changes: { [uid: string]: boolean }) => {
			const { activeCollection } = appState;
			if (!activeCollection) {
				return;
			}

			const nextSelection = new Set(activeCollection.mods);
			let changed = false;
			let deselectingModManager = false;

			Object.entries(changes).forEach(([uid, checked]) => {
				if (checked) {
					if (!nextSelection.has(uid)) {
						nextSelection.add(uid);
						changed = true;
					}
				} else if (uid !== getModManagerUID()) {
					if (nextSelection.delete(uid)) {
						changed = true;
					}
				} else {
					deselectingModManager = true;
				}
			});

			if (deselectingModManager) {
				setModalType(CollectionManagerModalType.DESELECTING_MOD_MANAGER);
			}

			if (changed) {
				const nextSelectedMods = [...nextSelection].sort();
				if (hasSameSelectedMods(activeCollection.mods, nextSelectedMods)) {
					return;
				}

				validateAfterCollectionEdit({
					...cloneCollection(activeCollection),
					mods: nextSelectedMods
				});
			}
		},
		[appState, getModManagerUID, hasSameSelectedMods, setModalType, validateAfterCollectionEdit]
	);

	const recalculateModData = useCallback(() => {
		startTransition(() => {
			setFilteredRows(
				measurePerf('collection.filter.recalculate', () => getVisibleCollectionRows(appState.mods, searchStringRef.current), {
					queryLength: searchStringRef.current.length,
					totalMods: appState.mods.modIdToModDataMap.size
				})
			);
		});
	}, [appState.mods]);

	const onSearchChange = useCallback(
		(search: string) => {
			markPerfInteraction('collection.search.change', {
				queryLength: search.length,
				totalMods: appState.mods.modIdToModDataMap.size
			});
			setSearchString(search);
			searchStringRef.current = search;
			startTransition(() => {
				setFilteredRows(
					search.length > 0
						? measurePerf('collection.filter.searchChange', () => getVisibleCollectionRows(appState.mods, search), {
								queryLength: search.length,
								totalMods: appState.mods.modIdToModDataMap.size
							})
						: undefined
				);
			});
		},
		[appState.mods]
	);

	const onSearch = useCallback(
		(search: string) => {
			markPerfInteraction('collection.search.submit', {
				queryLength: search.length,
				totalMods: appState.mods.modIdToModDataMap.size
			});
			setSearchString(search);
			searchStringRef.current = search;
			startTransition(() => {
				setFilteredRows(
					search.length > 0
						? measurePerf('collection.filter.searchSubmit', () => getVisibleCollectionRows(appState.mods, search), {
								queryLength: search.length,
								totalMods: appState.mods.modIdToModDataMap.size
							})
						: undefined
				);
			});
		},
		[appState.mods]
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
						updateCollection: api.updateCollection,
						deleteCollection: api.deleteCollection,
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
			madeEdits,
			openNotification,
			rawPersistCollection,
			reportNewCollectionTransactionFailure,
			runQueuedCollectionWrite,
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
						updateCollection: api.updateCollection,
						deleteCollection: api.deleteCollection,
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
			madeEdits,
			openNotification,
			rawPersistCollection,
			reportNewCollectionTransactionFailure,
			runQueuedCollectionWrite,
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
					const updateSuccess = await api.renameCollection(cloneCollection(activeCollection), name);
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
						const rolledBack = await api.renameCollection(renamedCollection, oldName);
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
			runQueuedCollectionWrite,
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
				const deleteSuccess = await api.deleteCollection(name);
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
						const deletedFallbackCollection = await api.deleteCollection(lifecycleResult.activeCollection.name);
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
		notifyRollbackFailure,
		openNotification,
		persistConfigAndReportFailure,
		rawPersistCollection,
		runQueuedCollectionWrite
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
			runQueuedCollectionWrite
		]
	);

	const saveCollection = useCallback(
		async (collection: ModCollection, pureSave: boolean) => {
			await runQueuedCollectionWrite(async () => {
				setSavingCollection(true);
				try {
					const targetCollection = cloneCollection(collection);
					const writeSuccess = await api.updateCollection(targetCollection);
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
		[openNotification, runQueuedCollectionWrite]
	);

	return {
		searchString,
		filteredRows,
		madeEdits,
		savingCollection,
		setMadeEdits,
		setFilteredRows,
		getModManagerUID,
		persistCollection,
		recalculateModData,
		onSearchChange,
		onSearch,
		toggleMod,
		setEnabledMods,
		setModSubset,
		createNewCollection,
		duplicateCollection,
		renameCollection,
		deleteCollection,
		changeActiveCollection,
		saveCollection
	};
}

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppConfig, AppState, CollectionManagerModalType, ModCollection, ModData, ModType, filterRows } from 'model';
import api from 'renderer/Api';
import type { NotificationProps } from 'model';
import { writeConfig } from 'renderer/util/config-write';
import { validateCollectionName } from 'shared/collection-name';
import type { NotificationType } from './useNotifications';
import { cloneCollection, copyCollectionsMap, updateAppCollectionState, withActiveCollection } from './utils';

interface UseCollectionsOptions {
	appState: AppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	cancelValidation: () => void;
	resetValidationState: () => void;
	validateActiveCollection: (launchIfValid: boolean) => Promise<void>;
	setModalType: (modalType: CollectionManagerModalType) => void;
}

export interface CollectionDirtyDraft {
	hasChanges: boolean;
	collection: ModCollection | undefined;
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
	const { activeCollection: currentActiveCollection } = appState;

	useEffect(() => {
		searchStringRef.current = searchString;
	}, [searchString]);

	const getModManagerUID = useCallback(() => {
		return `${ModType.WORKSHOP}:${appState.config.workshopID}`;
	}, [appState.config.workshopID]);

	const dirtyDraft = useMemo<CollectionDirtyDraft>(
		() => ({
			hasChanges: madeEdits,
			collection: madeEdits ? appState.activeCollection : undefined
		}),
		[appState.activeCollection, madeEdits]
	);

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

	const runQueuedCollectionWrite = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
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

	const persistDirtyDraft = useCallback(
		(draft: CollectionDirtyDraft) => {
			if (!draft.hasChanges || !draft.collection) {
				return Promise.resolve(true);
			}

			return rawPersistCollection(draft.collection);
		},
		[rawPersistCollection]
	);

	const commitCollectionState = useCallback(
		(
			nextCollections: Map<string, ModCollection>,
			nextCollectionNames: Set<string>,
			nextActiveCollection: ModCollection | undefined,
			nextConfig: AppConfig
		) => {
			startTransition(() => {
				updateAppCollectionState(appState, nextCollections, nextCollectionNames, nextActiveCollection, nextConfig);
			});
		},
		[appState]
	);

	const applyActiveCollection = useCallback(
		(nextCollection: ModCollection) => {
			const nextCollections = copyCollectionsMap(appState.allCollections);
			nextCollections.set(nextCollection.name, nextCollection);
			commitCollectionState(nextCollections, appState.allCollectionNames, nextCollection, appState.config);
		},
		[appState, commitCollectionState]
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
			setFilteredRows(filterRows(appState.mods, searchStringRef.current));
		});
	}, [appState.mods]);

	const onSearchChange = useCallback(
		(search: string) => {
			setSearchString(search);
			searchStringRef.current = search;
			startTransition(() => {
				setFilteredRows(search.length > 0 ? filterRows(appState.mods, search) : undefined);
			});
		},
		[appState.mods]
	);

	const onSearch = useCallback(
		(search: string) => {
			setSearchString(search);
			searchStringRef.current = search;
			startTransition(() => {
				setFilteredRows(search.length > 0 ? filterRows(appState.mods, search) : undefined);
			});
		},
		[appState.mods]
	);

	const persistConfigAndReportFailure = useCallback(
		async (nextConfig: AppConfig, message = 'Failed to update config') => {
			try {
				await writeConfig(nextConfig);
				return true;
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message,
						placement: 'bottomLeft',
						duration: null
					},
					'error'
				);
				return false;
			}
		},
		[openNotification]
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

	const createNewCollection = useCallback(
		async (name: string, mods?: string[]) => {
			if (!validateCollectionNameOrNotify(name)) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				const persistedDraft = await persistDirtyDraft(dirtyDraft);
				if (!persistedDraft) {
					return;
				}

				setSavingCollection(true);
				const newCollection: ModCollection = {
					name,
					mods: mods || []
				};

				try {
					const writeSuccess = await api.updateCollection(newCollection);
					if (!writeSuccess) {
						openNotification(
							{
								message: `Failed to create new collection ${name}`,
								placement: 'bottomRight',
								duration: null
							},
							'error'
						);
						return;
					}

					const nextCollections = copyCollectionsMap(appState.allCollections);
					nextCollections.set(name, newCollection);
					const nextCollectionNames = new Set(appState.allCollectionNames);
					nextCollectionNames.add(name);
					const nextConfig = withActiveCollection(appState.config, name);

					const configPersisted = await persistConfigAndReportFailure(nextConfig, `Created collection ${name} but failed to activate it`);
					if (!configPersisted) {
						const rolledBack = await api.deleteCollection(name);
						if (!rolledBack) {
							notifyRollbackFailure(`Failed to roll back collection ${name} after the config update failed`);
						}
						return;
					}

					commitCollectionState(nextCollections, nextCollectionNames, newCollection, nextConfig);
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
					setSavingCollection(false);
				}
			});
		},
		[
			appState,
			commitCollectionState,
			dirtyDraft,
			notifyRollbackFailure,
			openNotification,
			persistConfigAndReportFailure,
			persistDirtyDraft,
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

				const persistedDraft = await persistDirtyDraft(dirtyDraft);
				if (!persistedDraft) {
					return;
				}

				setSavingCollection(true);
				const newCollection: ModCollection = {
					name,
					mods: [...activeCollection.mods]
				};
				const oldName = activeCollection.name;

				try {
					const writeSuccess = await api.updateCollection(newCollection);
					if (!writeSuccess) {
						openNotification(
							{
								message: `Failed to create new collection ${name}`,
								placement: 'bottomRight',
								duration: null
							},
							'error'
						);
						return;
					}

					const nextCollections = copyCollectionsMap(appState.allCollections);
					nextCollections.set(name, newCollection);
					const nextCollectionNames = new Set(appState.allCollectionNames);
					nextCollectionNames.add(name);
					const nextConfig = withActiveCollection(appState.config, name);

					const configPersisted = await persistConfigAndReportFailure(nextConfig, `Duplicated collection ${oldName} but failed to activate ${name}`);
					if (!configPersisted) {
						const rolledBack = await api.deleteCollection(name);
						if (!rolledBack) {
							notifyRollbackFailure(`Failed to roll back duplicated collection ${name} after the config update failed`);
						}
						return;
					}

					commitCollectionState(nextCollections, nextCollectionNames, newCollection, nextConfig);
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
					setSavingCollection(false);
				}
			});
		},
		[
			appState,
			commitCollectionState,
			dirtyDraft,
			notifyRollbackFailure,
			openNotification,
			persistConfigAndReportFailure,
			persistDirtyDraft,
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

					const renamedCollection: ModCollection = {
						...cloneCollection(activeCollection),
						name
					};
					const nextCollections = copyCollectionsMap(appState.allCollections);
					nextCollections.delete(oldName);
					nextCollections.set(name, renamedCollection);
					const nextCollectionNames = new Set(appState.allCollectionNames);
					nextCollectionNames.delete(oldName);
					nextCollectionNames.add(name);
					const nextConfig = withActiveCollection(appState.config, name);

					const configPersisted = await persistConfigAndReportFailure(nextConfig, `Renamed collection ${oldName} but failed to persist the active collection change`);
					if (!configPersisted) {
						const rolledBack = await api.renameCollection(renamedCollection, oldName);
						if (!rolledBack) {
							notifyRollbackFailure(`Failed to restore collection ${oldName} after the config update failed`);
						}
						return;
					}

					commitCollectionState(nextCollections, nextCollectionNames, renamedCollection, nextConfig);
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

				const nextCollections = copyCollectionsMap(appState.allCollections);
				nextCollections.delete(name);
				const nextCollectionNames = new Set(appState.allCollectionNames);
				nextCollectionNames.delete(name);

				let nextActiveCollection: ModCollection | undefined;
				if (nextCollectionNames.size > 0) {
					const [nextCollectionName] = [...nextCollectionNames].sort();
					nextActiveCollection = nextCollections.get(nextCollectionName);
				}

				let createdFallbackCollection = false;
				if (!nextActiveCollection) {
					nextActiveCollection = {
						name: 'default',
						mods: []
					};
					nextCollections.set(nextActiveCollection.name, nextActiveCollection);
					nextCollectionNames.add(nextActiveCollection.name);
					const createdDefaultCollection = await rawPersistCollection(nextActiveCollection);
					if (!createdDefaultCollection) {
						return;
					}
					createdFallbackCollection = true;
				}

				const nextConfig = withActiveCollection(appState.config, nextActiveCollection.name);

				const configPersisted = await persistConfigAndReportFailure(nextConfig, `Deleted collection ${name} but failed to persist the replacement selection`);
				if (!configPersisted) {
					if (createdFallbackCollection) {
						const deletedFallbackCollection = await api.deleteCollection(nextActiveCollection.name);
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

				commitCollectionState(nextCollections, nextCollectionNames, nextActiveCollection, nextConfig);
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
	}, [appState, commitCollectionState, notifyRollbackFailure, openNotification, persistConfigAndReportFailure, rawPersistCollection, runQueuedCollectionWrite]);

	const changeActiveCollection = useCallback(
		async (name: string) => {
			const nextActiveCollection = appState.allCollections.get(name);
			if (!nextActiveCollection || appState.activeCollection?.name === name) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				setSavingCollection(true);
				try {
					const persistedDraft = await persistDirtyDraft(dirtyDraft);
					if (!persistedDraft) {
						return;
					}

					const nextConfig = withActiveCollection(appState.config, name);
					const configPersisted = await persistConfigAndReportFailure(nextConfig, `Failed to switch to collection ${name}`);
					if (!configPersisted) {
						return;
					}

					resetValidationState();
					commitCollectionState(appState.allCollections, appState.allCollectionNames, cloneCollection(nextActiveCollection), nextConfig);
					setMadeEdits(false);
				} finally {
					setSavingCollection(false);
				}
			});
		},
		[
			appState,
			commitCollectionState,
			dirtyDraft,
			persistConfigAndReportFailure,
			persistDirtyDraft,
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
		dirtyDraft,
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

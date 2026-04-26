import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { AppConfig, CollectionManagerModalType, ModCollection, ModData, ModType } from 'model';
import type { NotificationProps } from 'model';
import api from 'renderer/Api';
import { useDeleteCollectionMutation, useRenameCollectionMutation, useUpdateCollectionMutation } from 'renderer/async-cache';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { getVisibleCollectionRows } from 'renderer/collection-mod-projection';
import type { NotificationType } from './useNotifications';
import { cloneCollection, copyCollectionsMap } from './utils';
import { markPerfInteraction, measurePerf } from 'renderer/perf';
import { useCollectionLifecycleCommands } from './useCollectionLifecycleCommands';

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
	const { mutateAsync: updateCollectionFileMutation } = useUpdateCollectionMutation();
	const { mutateAsync: deleteCollectionFileMutation } = useDeleteCollectionMutation();
	const { mutateAsync: renameCollectionFileMutation } = useRenameCollectionMutation();

	useEffect(() => {
		searchStringRef.current = searchString;
	}, [searchString]);

	const getModManagerUID = useCallback(() => {
		return `${ModType.WORKSHOP}:${config.workshopID}`;
	}, [config.workshopID]);

	const hasSameSelectedMods = useCallback((selectedMods: string[], nextSelectedMods: string[]) => {
		return selectedMods.length === nextSelectedMods.length && selectedMods.every((uid, index) => uid === nextSelectedMods[index]);
	}, []);

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

	const persistCollectionFile = useCallback(
		async (collection: ModCollection) => {
			const targetCollection = cloneCollection(collection);
			try {
				await updateCollectionFileMutation(targetCollection);
				return true;
			} catch (error) {
				api.logger.error(error);
				return false;
			}
		},
		[updateCollectionFileMutation]
	);

	const deleteCollectionFile = useCallback(
		async (collectionName: string) => {
			try {
				await deleteCollectionFileMutation(collectionName);
				return true;
			} catch (error) {
				api.logger.error(error);
				return false;
			}
		},
		[deleteCollectionFileMutation]
	);

	const renameCollectionFile = useCallback(
		async (collection: ModCollection, newName: string) => {
			try {
				await renameCollectionFileMutation({
					collection: cloneCollection(collection),
					newName
				});
				return true;
			} catch (error) {
				api.logger.error(error);
				return false;
			}
		},
		[renameCollectionFileMutation]
	);

	const rawPersistCollection = useCallback(
		async (collection: ModCollection) => {
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
			}
			return writeSuccess;
		},
		[openNotification, persistCollectionFile]
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

	const { createNewCollection, duplicateCollection, renameCollection, deleteCollection, changeActiveCollection, saveCollection } =
		useCollectionLifecycleCommands({
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
		});

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

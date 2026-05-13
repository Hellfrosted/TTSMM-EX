import type { NotificationProps } from 'model';
import { cloneCollection, createModManagerUid, ModCollection, type ModData } from 'model';
import { useCallback, useMemo, useState } from 'react';
import api from 'renderer/Api';
import { useUpdateCollectionMutation } from 'renderer/async-cache';
import { createCollectionWriteQueue } from 'renderer/collection-content-save';
import {
	type CollectionContentSaveCompletion,
	type CollectionDraftEditResult,
	setCollectionDraftEnabledMods,
	setCollectionDraftModSubset,
	toggleCollectionDraftMod
} from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { CollectionLifecycleResult } from 'shared/collection-lifecycle';
import { type CollectionContentSaveCommandOptions, useCollectionLifecycleCommands } from './useCollectionLifecycleCommands';
import { useCollectionRowProjection } from './useCollectionRowProjection';
import type { NotificationType } from './useNotifications';

interface UseCollectionsOptions {
	activeCollectionDraft?: ModCollection;
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	resetValidationState: () => void;
	onActiveDraftEdited: (edit: CollectionDraftEditResult) => void;
	onCollectionContentSaveCompleted?: (completion: CollectionContentSaveCompletion) => void;
	onCollectionLifecycleResultApplied?: (result: Extract<CollectionLifecycleResult, { ok: true }>) => void;
	draftState?: {
		hasUnsavedDraft: boolean;
		setHasUnsavedDraft: (hasUnsavedDraft: boolean) => void;
	};
}

interface UseCollectionsResult {
	changeActiveCollection: (name: string) => Promise<void>;
	createNewCollection: (name: string, mods?: string[]) => Promise<void>;
	deleteCollection: () => Promise<void>;
	duplicateCollection: (name: string) => Promise<void>;
	filteredRows: ModData[] | undefined;
	getModManagerUID: () => string;
	madeEdits: boolean;
	onSearch: (search: string) => void;
	onSearchChange: (search: string) => void;
	persistCollection: (collection: ModCollection) => Promise<boolean>;
	recalculateModData: () => void;
	renameCollection: (name: string) => Promise<void>;
	rows: ModData[];
	saveCollection: (collection: ModCollection, pureSave: boolean, options?: CollectionContentSaveCommandOptions) => Promise<boolean>;
	savingCollection: boolean;
	searchString: string;
	setEnabledMods: (enabledMods: Set<string>) => void;
	setMadeEdits: (madeEdits: boolean) => void;
	setModSubset: (changes: { [uid: string]: boolean }) => void;
	toggleMod: (checked: boolean, uid: string) => void;
}

export function useCollections({
	activeCollectionDraft,
	appState,
	draftState,
	openNotification,
	resetValidationState,
	onCollectionContentSaveCompleted,
	onCollectionLifecycleResultApplied,
	onActiveDraftEdited
}: UseCollectionsOptions): UseCollectionsResult {
	const [savingCollection, setSavingCollection] = useState(false);
	const [localMadeEdits, setLocalMadeEdits] = useState(false);
	const collectionWriteQueue = useMemo(() => createCollectionWriteQueue(), []);
	const { config } = appState;
	const activeCollectionDraftOrFallback = activeCollectionDraft ?? appState.activeCollection;
	const { mutateAsync: updateCollectionFileMutation } = useUpdateCollectionMutation();
	const { filteredRows, onSearch, onSearchChange, recalculateModData, rows, searchString } = useCollectionRowProjection({
		collection: activeCollectionDraftOrFallback,
		mods: appState.mods
	});
	const madeEdits = draftState?.hasUnsavedDraft ?? localMadeEdits;
	const setMadeEdits = useCallback(
		(nextMadeEdits: boolean) => {
			if (draftState) {
				draftState.setHasUnsavedDraft(nextMadeEdits);
				return;
			}
			setLocalMadeEdits(nextMadeEdits);
		},
		[draftState]
	);

	const getModManagerUID = useCallback(() => {
		return createModManagerUid(config.workshopID);
	}, [config.workshopID]);

	const runQueuedCollectionWrite = useCallback(
		async <T>(operation: () => Promise<T>): Promise<T> => collectionWriteQueue.run(operation),
		[collectionWriteQueue]
	);

	const persistCollectionFile = useCallback(
		async (collection: ModCollection) => {
			const targetCollection = cloneCollection(collection);
			try {
				return await updateCollectionFileMutation(targetCollection);
			} catch (error) {
				api.logger.error(error);
				return {
					ok: false,
					code: 'write-failed',
					message: `Failed to save collection ${targetCollection.name}`
				} as const;
			}
		},
		[updateCollectionFileMutation]
	);

	const applyActiveDraftEdit = useCallback(
		(edit: CollectionDraftEditResult) => {
			onActiveDraftEdited(edit);
			if (edit.nextDraft) {
				setMadeEdits(true);
			}
		},
		[onActiveDraftEdited, setMadeEdits]
	);

	const toggleMod = useCallback(
		(checked: boolean, uid: string) => {
			applyActiveDraftEdit(
				toggleCollectionDraftMod({
					checked,
					collection: activeCollectionDraftOrFallback,
					modManagerUid: getModManagerUID(),
					uid
				})
			);
		},
		[activeCollectionDraftOrFallback, applyActiveDraftEdit, getModManagerUID]
	);

	const setEnabledMods = useCallback(
		(enabledMods: Set<string>) => {
			applyActiveDraftEdit(
				setCollectionDraftEnabledMods({
					collection: activeCollectionDraftOrFallback,
					enabledMods,
					modManagerUid: getModManagerUID()
				})
			);
		},
		[activeCollectionDraftOrFallback, applyActiveDraftEdit, getModManagerUID]
	);

	const setModSubset = useCallback(
		(changes: { [uid: string]: boolean }) => {
			applyActiveDraftEdit(
				setCollectionDraftModSubset({
					changes,
					collection: activeCollectionDraftOrFallback,
					modManagerUid: getModManagerUID()
				})
			);
		},
		[activeCollectionDraftOrFallback, applyActiveDraftEdit, getModManagerUID]
	);

	const { createNewCollection, duplicateCollection, renameCollection, deleteCollection, changeActiveCollection, saveCollection } =
		useCollectionLifecycleCommands({
			appState,
			activeCollectionDraft: activeCollectionDraftOrFallback,
			madeEdits,
			onCollectionContentSaveCompleted,
			onCollectionLifecycleResultApplied,
			openNotification,
			persistCollectionFile,
			resetValidationState,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection
		});

	const persistCollection = useCallback(
		(collection: ModCollection) => saveCollection(collection, true, { showSuccessNotification: false }),
		[saveCollection]
	);

	return {
		searchString,
		filteredRows,
		madeEdits,
		savingCollection,
		rows,
		setMadeEdits,
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

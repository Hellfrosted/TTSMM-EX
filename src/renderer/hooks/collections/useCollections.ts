import type { NotificationProps } from 'model';
import { cloneCollection, createModManagerUid, ModCollection, type ModData } from 'model';
import { startTransition, useCallback, useMemo, useState } from 'react';
import api from 'renderer/Api';
import { useUpdateCollectionMutation } from 'renderer/async-cache';
import { createCollectionWriteQueue } from 'renderer/collection-content-save';
import {
	type CollectionContentSaveCompletion,
	type CollectionDraftEditWorkflow,
	createCollectionDraftEditWorkflow,
	setCollectionDraftEnabledMods,
	setCollectionDraftModSubset,
	toggleCollectionDraftMod
} from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { type CollectionContentSaveCommandOptions, useCollectionLifecycleCommands } from './useCollectionLifecycleCommands';
import { useCollectionRowProjection } from './useCollectionRowProjection';
import type { NotificationType } from './useNotifications';

interface UseCollectionsOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	resetValidationState: () => void;
	onDraftEditWorkflow: (workflow: CollectionDraftEditWorkflow) => void;
	onCollectionContentSaveCompleted?: (completion: CollectionContentSaveCompletion) => void;
	onCollectionLifecycleResultApplied?: () => void;
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
	appState,
	draftState,
	openNotification,
	resetValidationState,
	onCollectionContentSaveCompleted,
	onCollectionLifecycleResultApplied,
	onDraftEditWorkflow
}: UseCollectionsOptions): UseCollectionsResult {
	const [savingCollection, setSavingCollection] = useState(false);
	const [localMadeEdits, setLocalMadeEdits] = useState(false);
	const collectionWriteQueue = useMemo(() => createCollectionWriteQueue(), []);
	const { config, updateState } = appState;
	const { mutateAsync: updateCollectionFileMutation } = useUpdateCollectionMutation();
	const { filteredRows, onSearch, onSearchChange, recalculateModData, rows, searchString } = useCollectionRowProjection({
		collection: appState.activeCollection,
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

	const applyActiveCollectionDraft = useCallback(
		(nextCollection: ModCollection) => {
			startTransition(() => {
				updateState({
					activeCollection: nextCollection
				});
			});
		},
		[updateState]
	);

	const applyCollectionDraftEditWorkflow = useCallback(
		(workflow: CollectionDraftEditWorkflow) => {
			onDraftEditWorkflow(workflow);
			if (!workflow.nextDraft) {
				return;
			}

			if (workflow.shouldMarkUnsavedDraft) {
				setMadeEdits(true);
			}
			applyActiveCollectionDraft(workflow.nextDraft);
		},
		[applyActiveCollectionDraft, onDraftEditWorkflow, setMadeEdits]
	);

	const toggleMod = useCallback(
		(checked: boolean, uid: string) => {
			const { activeCollection } = appState;
			applyCollectionDraftEditWorkflow(
				createCollectionDraftEditWorkflow(
					toggleCollectionDraftMod({
						checked,
						collection: activeCollection,
						modManagerUid: getModManagerUID(),
						uid
					})
				)
			);
		},
		[appState, applyCollectionDraftEditWorkflow, getModManagerUID]
	);

	const setEnabledMods = useCallback(
		(enabledMods: Set<string>) => {
			const { activeCollection } = appState;
			applyCollectionDraftEditWorkflow(
				createCollectionDraftEditWorkflow(
					setCollectionDraftEnabledMods({
						collection: activeCollection,
						enabledMods,
						modManagerUid: getModManagerUID()
					})
				)
			);
		},
		[appState, applyCollectionDraftEditWorkflow, getModManagerUID]
	);

	const setModSubset = useCallback(
		(changes: { [uid: string]: boolean }) => {
			const { activeCollection } = appState;
			applyCollectionDraftEditWorkflow(
				createCollectionDraftEditWorkflow(
					setCollectionDraftModSubset({
						changes,
						collection: activeCollection,
						modManagerUid: getModManagerUID()
					})
				)
			);
		},
		[appState, applyCollectionDraftEditWorkflow, getModManagerUID]
	);

	const { createNewCollection, duplicateCollection, renameCollection, deleteCollection, changeActiveCollection, saveCollection } =
		useCollectionLifecycleCommands({
			appState,
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

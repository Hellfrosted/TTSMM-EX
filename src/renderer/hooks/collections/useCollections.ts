import { startTransition, useCallback, useMemo, useState } from 'react';
import { cloneCollection, ModCollection, ModType } from 'model';
import type { NotificationProps } from 'model';
import api from 'renderer/Api';
import { useUpdateCollectionMutation } from 'renderer/async-cache';
import { createCollectionWriteQueue, runCollectionContentSave } from 'renderer/collection-content-save';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import {
	createCollectionDraftEditWorkflow,
	setCollectionDraftEnabledMods,
	setCollectionDraftModSubset,
	toggleCollectionDraftMod,
	type CollectionContentSaveCompletion,
	type CollectionDraftEditWorkflow
} from 'renderer/collection-workspace-session';
import type { NotificationType } from './useNotifications';
import { useCollectionLifecycleCommands } from './useCollectionLifecycleCommands';
import { useCollectionRowProjection } from './useCollectionRowProjection';

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

export function useCollections({
	appState,
	draftState,
	openNotification,
	resetValidationState,
	onCollectionContentSaveCompleted,
	onCollectionLifecycleResultApplied,
	onDraftEditWorkflow
}: UseCollectionsOptions) {
	const [savingCollection, setSavingCollection] = useState(false);
	const [localMadeEdits, setLocalMadeEdits] = useState(false);
	const collectionWriteQueue = useMemo(() => createCollectionWriteQueue(), []);
	const { config, updateState } = appState;
	const { mutateAsync: updateCollectionFileMutation } = useUpdateCollectionMutation();
	const { filteredRows, onSearch, onSearchChange, recalculateModData, searchString } = useCollectionRowProjection({
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
		return `${ModType.WORKSHOP}:${config.workshopID}`;
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

	const persistCollection = useCallback(
		(collection: ModCollection) => {
			return runQueuedCollectionWrite(async () => {
				const saveOutcome = await runCollectionContentSave({
					collection,
					hasUnsavedDraft: madeEdits,
					logger: api.logger,
					persistCollectionFile,
					pureSave: true
				});
				if (saveOutcome.notification) {
					openNotification(saveOutcome.notification.props, saveOutcome.notification.type);
				}
				if (onCollectionContentSaveCompleted) {
					onCollectionContentSaveCompleted({
						pureSave: true,
						writeAccepted: saveOutcome.writeAccepted
					});
				} else if (saveOutcome.nextHasUnsavedDraft !== madeEdits) {
					setMadeEdits(saveOutcome.nextHasUnsavedDraft);
				}
				return saveOutcome.writeAccepted;
			});
		},
		[madeEdits, onCollectionContentSaveCompleted, openNotification, persistCollectionFile, runQueuedCollectionWrite, setMadeEdits]
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

	return {
		searchString,
		filteredRows,
		madeEdits,
		savingCollection,
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

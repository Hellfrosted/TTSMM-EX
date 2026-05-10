import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type ModCollection, type NotificationProps } from 'model';
import api from 'renderer/Api';
import { applyAuthoritativeCollectionStateToCache } from 'renderer/async-cache';
import { runCollectionContentSave } from 'renderer/collection-content-save';
import { applyCollectionContentSaveResult, type CollectionContentSaveCompletion } from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { createCollectionLifecycleCommandRunner } from 'renderer/collection-lifecycle-command-runner';
import type { CollectionContentSaveResult } from 'shared/collection-content-save';
import type { NotificationType } from './useNotifications';

interface UseCollectionLifecycleCommandsOptions {
	appState: CollectionWorkspaceAppState;
	madeEdits: boolean;
	onCollectionContentSaveCompleted?: (completion: CollectionContentSaveCompletion) => void;
	onCollectionLifecycleResultApplied?: () => void;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	persistCollectionFile: (collection: ModCollection) => Promise<CollectionContentSaveResult>;
	resetValidationState: () => void;
	runQueuedCollectionWrite: <T>(operation: () => Promise<T>) => Promise<T>;
	setMadeEdits: (madeEdits: boolean) => void;
	setSavingCollection: (savingCollection: boolean) => void;
}

export interface CollectionContentSaveCommandOptions {
	showSuccessNotification?: boolean;
}

export function useCollectionLifecycleCommands({
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
}: UseCollectionLifecycleCommandsOptions) {
	const { updateState } = appState;
	const queryClient = useQueryClient();
	const lifecycleCommands = useMemo(
		() =>
			createCollectionLifecycleCommandRunner({
				applyLifecycleResult: (result) => {
					applyAuthoritativeCollectionStateToCache(queryClient, result);
				},
				client: api,
				getState: () => ({
					activeCollection: appState.activeCollection,
					config: appState.config,
					hasUnsavedDraft: madeEdits
				}),
				logger: api.logger,
				onLifecycleResultApplied: onCollectionLifecycleResultApplied,
				openNotification,
				resetValidationState,
				runQueuedCollectionWrite,
				setMadeEdits,
				setSavingCollection,
				updateState
			}),
		[
			appState.activeCollection,
			appState.config,
			madeEdits,
			onCollectionLifecycleResultApplied,
			openNotification,
			queryClient,
			resetValidationState,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection,
			updateState
		]
	);

	const createNewCollection = useCallback(
		async (name: string, mods?: string[]) => {
			await lifecycleCommands.run({ kind: 'create', name, mods: mods || [] });
		},
		[lifecycleCommands]
	);

	const duplicateCollection = useCallback(
		async (name: string) => {
			await lifecycleCommands.run({ kind: 'duplicate', name, sourceName: appState.activeCollection?.name ?? name });
		},
		[appState.activeCollection?.name, lifecycleCommands]
	);

	const renameCollection = useCallback(
		async (name: string) => {
			await lifecycleCommands.run({ kind: 'rename', name, previousName: appState.activeCollection?.name ?? name });
		},
		[appState.activeCollection?.name, lifecycleCommands]
	);

	const deleteCollection = useCallback(async () => {
		await lifecycleCommands.run({ kind: 'delete', deletedName: appState.activeCollection?.name });
	}, [appState.activeCollection?.name, lifecycleCommands]);

	const changeActiveCollection = useCallback(
		async (name: string) => {
			await lifecycleCommands.run({ kind: 'switch', name });
		},
		[lifecycleCommands]
	);

	const saveCollection = useCallback(
		async (collection: ModCollection, pureSave: boolean, options: CollectionContentSaveCommandOptions = {}) => {
			let writeAccepted = false;
			await runQueuedCollectionWrite(async () => {
				setSavingCollection(true);
				try {
					const saveOutcome = await runCollectionContentSave({
						collection,
						logger: api.logger,
						persistCollectionFile,
						pureSave,
						showSuccessNotification: options.showSuccessNotification ?? true
					});
					writeAccepted = saveOutcome.writeAccepted;
					if (saveOutcome.notification) {
						openNotification(saveOutcome.notification.props, saveOutcome.notification.type);
					}
					if (onCollectionContentSaveCompleted) {
						onCollectionContentSaveCompleted(saveOutcome.completion);
					}
					const completionState = applyCollectionContentSaveResult({
						hasUnsavedDraft: madeEdits,
						...saveOutcome.completion
					});
					if (completionState.hasUnsavedDraft !== madeEdits) {
						setMadeEdits(completionState.hasUnsavedDraft);
					}
				} catch (error) {
					api.logger.error(error);
				} finally {
					setSavingCollection(false);
				}
			});
			return writeAccepted;
		},
		[
			madeEdits,
			onCollectionContentSaveCompleted,
			openNotification,
			persistCollectionFile,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection
		]
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

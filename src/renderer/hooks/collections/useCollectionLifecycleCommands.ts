import { Effect } from 'effect';
import { type ModCollection, type NotificationProps } from 'model';
import { useCallback, useMemo } from 'react';
import api from 'renderer/Api';
import { applyAuthoritativeCollectionStateToCache } from 'renderer/async-cache';
import { getCollectionContentSaveStateUpdate } from 'renderer/authoritative-collection-state';
import { runCollectionContentSave } from 'renderer/collection-content-save';
import { createCollectionLifecycleCommandRunner } from 'renderer/collection-lifecycle-command-runner';
import { applyCollectionContentSaveResult, type CollectionContentSaveCompletion } from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { CollectionContentSaveResult } from 'shared/collection-content-save';
import type { CollectionLifecycleResult } from 'shared/collection-lifecycle';
import type { NotificationType } from './useNotifications';

interface UseCollectionLifecycleCommandsOptions {
	activeCollectionDraft?: ModCollection;
	appState: CollectionWorkspaceAppState;
	madeEdits: boolean;
	onCollectionContentSaveCompleted?: (completion: CollectionContentSaveCompletion) => void;
	onCollectionLifecycleResultApplied?: (result: Extract<CollectionLifecycleResult, { ok: true }>) => void;
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
	activeCollectionDraft,
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
	const lifecycleCommands = useMemo(
		() =>
			createCollectionLifecycleCommandRunner({
				applyLifecycleResult: (result) => {
					applyAuthoritativeCollectionStateToCache(result);
				},
				client: api,
				getState: () => ({
					activeCollection: activeCollectionDraft,
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
			appState.config,
			activeCollectionDraft,
			madeEdits,
			onCollectionLifecycleResultApplied,
			openNotification,
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
			await lifecycleCommands.run({ kind: 'duplicate', name, sourceName: activeCollectionDraft?.name ?? name });
		},
		[activeCollectionDraft?.name, lifecycleCommands]
	);

	const renameCollection = useCallback(
		async (name: string) => {
			await lifecycleCommands.run({ kind: 'rename', name, previousName: activeCollectionDraft?.name ?? name });
		},
		[activeCollectionDraft?.name, lifecycleCommands]
	);

	const deleteCollection = useCallback(async () => {
		await lifecycleCommands.run({ kind: 'delete', deletedName: activeCollectionDraft?.name });
	}, [activeCollectionDraft?.name, lifecycleCommands]);

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
					const saveOutcome = await Effect.runPromise(
						runCollectionContentSave({
							collection,
							logger: api.logger,
							persistCollectionFile: (targetCollection) =>
								Effect.tryPromise({
									try: () => persistCollectionFile(targetCollection),
									catch: (error) => error
								}),
							pureSave,
							showSuccessNotification: options.showSuccessNotification ?? true
						})
					);
					writeAccepted = saveOutcome.writeAccepted;
					if (writeAccepted) {
						updateState(getCollectionContentSaveStateUpdate(appState, saveOutcome.targetCollection));
					}
					if (saveOutcome.notification) {
						openNotification(saveOutcome.notification.props, saveOutcome.notification.type);
					}
					if (onCollectionContentSaveCompleted) {
						onCollectionContentSaveCompleted({
							...saveOutcome.completion,
							savedCollection: saveOutcome.writeAccepted ? saveOutcome.targetCollection : undefined
						});
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
			appState,
			madeEdits,
			onCollectionContentSaveCompleted,
			openNotification,
			persistCollectionFile,
			runQueuedCollectionWrite,
			setMadeEdits,
			setSavingCollection,
			updateState
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

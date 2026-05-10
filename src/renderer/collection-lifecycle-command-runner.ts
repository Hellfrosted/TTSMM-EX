import { startTransition } from 'react';
import { type AppConfig, type ModCollection, type NotificationProps } from 'model';
import type { AppStateUpdate } from 'model/AppState';
import { applyAuthoritativeCollectionState, getAuthoritativeCollectionStateUpdate } from 'renderer/authoritative-collection-state';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { CollectionLifecycleResult } from 'shared/collection-lifecycle';
import { validateCollectionName } from 'shared/collection-name';
import { getCollectionLifecycleDirtyDraft } from './collection-workspace-session';
import type { NotificationType } from './hooks/collections/useNotifications';

type CollectionLifecycleCommandIntent =
	| {
			kind: 'create';
			name: string;
			mods?: string[];
	  }
	| {
			kind: 'duplicate';
			name: string;
			sourceName?: string;
	  }
	| {
			kind: 'rename';
			name: string;
			previousName?: string;
	  }
	| {
			kind: 'delete';
			deletedName?: string;
	  }
	| {
			kind: 'switch';
			name: string;
	  };

type CollectionLifecycleSuccessResult = Extract<CollectionLifecycleResult, { ok: true }>;
type CollectionLifecycleFailureResult = Extract<CollectionLifecycleResult, { ok: false }>;

interface CollectionLifecycleStateSnapshot {
	activeCollection?: ModCollection;
	config: AppConfig;
	hasUnsavedDraft: boolean;
}

interface CollectionLifecycleClient {
	createCollectionLifecycle: (request: {
		config: AppConfig;
		dirtyCollection?: ModCollection;
		name: string;
		mods: string[];
	}) => Promise<CollectionLifecycleResult>;
	deleteCollectionLifecycle: (request: { config: AppConfig; dirtyCollection?: ModCollection }) => Promise<CollectionLifecycleResult>;
	duplicateCollectionLifecycle: (request: {
		config: AppConfig;
		dirtyCollection?: ModCollection;
		name: string;
	}) => Promise<CollectionLifecycleResult>;
	renameCollectionLifecycle: (request: {
		config: AppConfig;
		dirtyCollection?: ModCollection;
		name: string;
	}) => Promise<CollectionLifecycleResult>;
	switchCollectionLifecycle: (request: {
		config: AppConfig;
		dirtyCollection?: ModCollection;
		name: string;
	}) => Promise<CollectionLifecycleResult>;
}

interface CollectionLifecycleCommandRunnerOptions {
	client: CollectionLifecycleClient;
	getState: () => CollectionLifecycleStateSnapshot;
	logger: Pick<Console, 'error'>;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	applyLifecycleResult?: (result: CollectionLifecycleSuccessResult) => void;
	onLifecycleResultApplied?: () => void;
	resetValidationState: () => void;
	runQueuedCollectionWrite: <T>(operation: () => Promise<T>) => Promise<T>;
	setMadeEdits: (madeEdits: boolean) => void;
	setSavingCollection: (savingCollection: boolean) => void;
	updateState: CollectionWorkspaceAppState['updateState'];
}

function commandRequiresCollectionName(
	intent: CollectionLifecycleCommandIntent
): intent is Extract<CollectionLifecycleCommandIntent, { name: string }> {
	return intent.kind !== 'delete';
}

function notifyCollectionNameFailure(
	intent: CollectionLifecycleCommandIntent,
	openNotification: (props: NotificationProps, type?: NotificationType) => void
) {
	if (!commandRequiresCollectionName(intent)) {
		return false;
	}

	const validationError = validateCollectionName(intent.name);
	if (!validationError) {
		return false;
	}

	openNotification(
		{
			message: validationError,
			placement: 'bottomRight',
			duration: null
		},
		'error'
	);
	return true;
}

export function getCollectionLifecycleFailureNotification(result: CollectionLifecycleFailureResult): NotificationProps {
	return {
		message: result.message,
		placement: result.code === 'config-write-failed' || result.code === 'rollback-failed' ? 'bottomLeft' : 'bottomRight',
		duration: null
	};
}

export function getCollectionLifecycleSuccessNotification(
	intent: CollectionLifecycleCommandIntent,
	state: CollectionLifecycleStateSnapshot
): NotificationProps | undefined {
	switch (intent.kind) {
		case 'create':
			return {
				message: `Created new collection ${intent.name}`,
				placement: 'bottomRight',
				duration: 1
			};
		case 'duplicate':
			return {
				message: `Duplicated collection ${intent.sourceName ?? state.activeCollection?.name ?? intent.name}`,
				placement: 'bottomRight',
				duration: 1
			};
		case 'rename':
			return {
				message: `Collection ${intent.previousName ?? state.activeCollection?.name ?? intent.name} renamed to ${intent.name}`,
				placement: 'bottomRight',
				duration: 1
			};
		case 'delete':
			return {
				message: intent.deletedName ? `Collection ${intent.deletedName} deleted` : 'Collection deleted',
				placement: 'bottomRight',
				duration: 1
			};
		case 'switch':
			return undefined;
	}
}

export function getCollectionLifecycleStateUpdate(result: CollectionLifecycleSuccessResult): AppStateUpdate {
	return getAuthoritativeCollectionStateUpdate(result);
}

function invokeLifecycleCommand(
	client: CollectionLifecycleClient,
	intent: CollectionLifecycleCommandIntent,
	state: CollectionLifecycleStateSnapshot
) {
	const dirtyCollection = getCollectionLifecycleDirtyDraft({
		draft: state.activeCollection,
		hasUnsavedDraft: state.hasUnsavedDraft
	});

	switch (intent.kind) {
		case 'create':
			return client.createCollectionLifecycle({
				config: state.config,
				dirtyCollection,
				name: intent.name,
				mods: intent.mods ?? []
			});
		case 'duplicate':
			return client.duplicateCollectionLifecycle({
				config: state.config,
				dirtyCollection,
				name: intent.name
			});
		case 'rename':
			return client.renameCollectionLifecycle({
				config: state.config,
				dirtyCollection,
				name: intent.name
			});
		case 'delete':
			return client.deleteCollectionLifecycle({
				config: state.config,
				dirtyCollection
			});
		case 'switch':
			return client.switchCollectionLifecycle({
				config: state.config,
				dirtyCollection,
				name: intent.name
			});
	}
}

export function createCollectionLifecycleCommandRunner({
	applyLifecycleResult,
	client,
	getState,
	logger,
	onLifecycleResultApplied,
	openNotification,
	resetValidationState,
	runQueuedCollectionWrite,
	setMadeEdits,
	setSavingCollection,
	updateState
}: CollectionLifecycleCommandRunnerOptions) {
	return {
		async run(intent: CollectionLifecycleCommandIntent) {
			if (notifyCollectionNameFailure(intent, openNotification)) {
				return;
			}

			if (intent.kind === 'switch' && getState().activeCollection?.name === intent.name) {
				return;
			}

			await runQueuedCollectionWrite(async () => {
				setSavingCollection(true);
				const state = getState();

				try {
					const result = await invokeLifecycleCommand(client, intent, state);
					if (!result.ok) {
						openNotification(getCollectionLifecycleFailureNotification(result), 'error');
						return;
					}

					startTransition(() => {
						applyAuthoritativeCollectionState(result, {
							syncCache: applyLifecycleResult,
							updateState
						});
					});
					if (onLifecycleResultApplied) {
						onLifecycleResultApplied();
					} else {
						setMadeEdits(false);
					}
					if (intent.kind === 'switch') {
						resetValidationState();
					}

					const successNotification = getCollectionLifecycleSuccessNotification(intent, state);
					if (successNotification) {
						openNotification(successNotification, 'success');
					}
				} catch (error) {
					logger.error(error);
					openNotification(
						{
							message: 'Collection action failed',
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
				} finally {
					setSavingCollection(false);
				}
			});
		}
	};
}

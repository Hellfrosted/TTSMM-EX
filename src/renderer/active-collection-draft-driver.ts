import { CollectionManagerModalType, type ModCollection } from 'model';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import {
	type CollectionContentSaveCompletion,
	type CollectionDraftEditResult,
	type CollectionValidationRunOutcome,
	type CollectionWorkspaceSession,
	type CollectionWorkspaceWorkflowEffect,
	type CollectionWorkspaceWorkflowEvent,
	type CollectionWorkspaceWorkflowState,
	createCollectionWorkspaceSession,
	createCollectionWorkspaceWorkflowState,
	reduceCollectionWorkspaceWorkflow
} from './collection-workspace-session';

export interface ActiveCollectionDraftDriverFacts {
	gameRunning: boolean;
	launchingGame: boolean;
	loadingMods: boolean;
	overrideGameRunning: boolean;
	savingDraft: boolean;
}

export interface ActiveCollectionDraftDriverAdapters {
	cancelValidation: () => void;
	clearCollectionErrors: () => void;
	clearLaunchState: () => void;
	launchDraft: (draft: ModCollection) => void | Promise<void>;
	openModal: (modalType: CollectionManagerModalType) => void;
	persistDraft: (draft: ModCollection) => void | Promise<unknown>;
	recalculateModData: () => void;
	setLaunchingGame: (launchingGame: boolean) => void;
	validateDraft: (
		draft: ModCollection | undefined,
		launchIfValid: boolean,
		options?: { config?: CollectionWorkspaceAppState['config'] }
	) => Promise<CollectionValidationRunOutcome>;
}

export type ActiveCollectionDraftDriverEvent =
	| {
			type: 'active-draft-changed';
			config: CollectionWorkspaceAppState['config'];
			currentDraft?: ModCollection;
	  }
	| {
			type: 'collection-content-save-completed';
			completion: CollectionContentSaveCompletion;
	  }
	| {
			type: 'collection-lifecycle-result-applied';
			config: CollectionWorkspaceAppState['config'];
			currentDraft?: ModCollection;
	  }
	| {
			edit: CollectionDraftEditResult;
			type: 'active-draft-edited';
	  }
	| {
			facts: ActiveCollectionDraftDriverFacts;
			type: 'runtime-facts-changed';
	  }
	| {
			type: 'has-unsaved-draft-changed';
			hasUnsavedDraft: boolean;
	  }
	| {
			type: 'launch-anyway-requested';
	  }
	| {
			type: 'launch-requested';
			modalOpen?: boolean;
	  }
	| {
			type: 'loaded-mods-changed';
			loadingMods?: boolean;
	  }
	| {
			type: 'mod-metadata-updated';
			loadingMods?: boolean;
	  }
	| {
			type: 'validate-requested';
			options?: { config?: CollectionWorkspaceAppState['config'] };
	  };

interface ActiveCollectionDraftDriverOptions {
	adapters: ActiveCollectionDraftDriverAdapters;
	initialFacts: ActiveCollectionDraftDriverFacts;
	initial: {
		config: CollectionWorkspaceAppState['config'];
		draft?: ModCollection;
	};
}

function workflowEventFromValidationOutcome(outcome: CollectionValidationRunOutcome): CollectionWorkspaceWorkflowEvent {
	switch (outcome.type) {
		case 'validation-run-failed':
		case 'missing-active-collection':
			return { type: 'validation-failed-to-run' };
		case 'cancelled':
			return { type: 'validation-cancelled' };
		case 'discarded-stale-result':
			return {
				type: 'validation-completed',
				result: outcome.validationResult
			};
		case 'recorded-current-result':
			return {
				type: 'validation-completed',
				result: outcome.validationResult
			};
		case 'recorded-failed-result':
			return {
				type: 'validation-completed',
				result: outcome.validationResult,
				modalType: outcome.modalType
			};
	}
}

export interface ActiveCollectionDraftDriver {
	dispatch(event: ActiveCollectionDraftDriverEvent): void;
	dispose(): void;
	getSnapshot(): CollectionWorkspaceSession;
	getWorkflowState(): CollectionWorkspaceWorkflowState;
	subscribe(listener: () => void): () => void;
}

export function createActiveCollectionDraftDriver({
	adapters,
	initialFacts,
	initial
}: ActiveCollectionDraftDriverOptions): ActiveCollectionDraftDriver {
	let disposed = false;
	let workflowState = createCollectionWorkspaceWorkflowState({
		config: initial.config,
		draft: initial.draft,
		runtimeFacts: initialFacts
	});
	const listeners = new Set<() => void>();

	const emit = () => {
		listeners.forEach((listener) => listener());
	};

	const getSnapshot = () => {
		return createCollectionWorkspaceSession({
			activeCollection: workflowState.draft,
			config: workflowState.config,
			hasUnsavedDraft: workflowState.hasUnsavedDraft,
			runtimeFacts: workflowState.runtimeFacts,
			validatingDraft: workflowState.validatingDraft,
			validationResult: workflowState.validationResult
		});
	};

	const applyWorkflowEvent = (event: CollectionWorkspaceWorkflowEvent) => {
		if (disposed) {
			return;
		}
		const transition = reduceCollectionWorkspaceWorkflow(workflowState, event);
		workflowState = transition.state;
		emit();
		transition.effects.forEach(runEffect);
	};

	let validationRequestId = 0;
	const isCurrentValidationRequest = (requestId: number) => !disposed && requestId === validationRequestId;
	const invalidateCurrentValidationRequest = () => {
		validationRequestId += 1;
	};
	const applyAcceptedValidationOutcome = (requestId: number, outcome: CollectionValidationRunOutcome) => {
		if (!isCurrentValidationRequest(requestId)) {
			return;
		}
		applyWorkflowEvent(workflowEventFromValidationOutcome(outcome));
	};
	const cancelValidation = () => {
		invalidateCurrentValidationRequest();
		adapters.cancelValidation();
	};
	const validateActiveDraft = (
		draft: ModCollection | undefined,
		launchIfValid: boolean,
		options?: { config?: CollectionWorkspaceAppState['config'] }
	) => {
		if (disposed) {
			return;
		}
		const requestId = validationRequestId + 1;
		validationRequestId = requestId;
		applyWorkflowEvent({ type: 'validation-started', launchIfValid });
		void adapters
			.validateDraft(draft, launchIfValid, options)
			.then((outcome) => {
				applyAcceptedValidationOutcome(requestId, outcome);
			})
			.catch(() => {
				applyAcceptedValidationOutcome(requestId, { type: 'validation-run-failed' });
			});
	};

	function runEffect(effect: CollectionWorkspaceWorkflowEffect) {
		if (disposed) {
			return;
		}
		switch (effect.type) {
			case 'open-blocked-mod-manager-deselect-dialog':
				adapters.openModal(CollectionManagerModalType.DESELECTING_MOD_MANAGER);
				break;
			case 'cancel-validation':
				cancelValidation();
				break;
			case 'recalculate-mod-data':
				adapters.recalculateModData();
				break;
			case 'validate-active-collection':
				validateActiveDraft(workflowState.draft, effect.launchIfValid);
				break;
			case 'persist-active-collection-draft':
				if (workflowState.draft) {
					void adapters.persistDraft(workflowState.draft);
				}
				break;
			case 'launch-current-draft':
				if (workflowState.draft) {
					void adapters.launchDraft(workflowState.draft);
				}
				break;
			case 'set-launching-game':
				adapters.setLaunchingGame(effect.launchingGame);
				break;
			case 'open-validation-modal':
				adapters.openModal(effect.modalType);
				break;
			case 'clear-collection-errors':
				adapters.clearCollectionErrors();
				break;
			case 'clear-launching-game':
				adapters.clearLaunchState();
				break;
		}
	}

	const dispatch = (event: ActiveCollectionDraftDriverEvent) => {
		if (disposed) {
			return;
		}
		switch (event.type) {
			case 'active-draft-changed':
				applyWorkflowEvent({ type: 'active-draft-changed', config: event.config, currentDraft: event.currentDraft });
				break;
			case 'collection-content-save-completed':
				applyWorkflowEvent({ type: 'collection-content-save-completed', ...event.completion });
				break;
			case 'collection-lifecycle-result-applied':
				applyWorkflowEvent({
					type: 'collection-lifecycle-result-applied',
					config: event.config,
					currentDraft: event.currentDraft
				});
				break;
			case 'active-draft-edited':
				applyWorkflowEvent({ type: 'active-draft-edited', edit: event.edit });
				break;
			case 'runtime-facts-changed':
				applyWorkflowEvent({ type: 'runtime-facts-changed', facts: event.facts });
				break;
			case 'has-unsaved-draft-changed':
				applyWorkflowEvent({ type: 'has-unsaved-draft-changed', hasUnsavedDraft: event.hasUnsavedDraft });
				break;
			case 'launch-anyway-requested':
				applyWorkflowEvent({ type: 'launch-anyway-requested' });
				break;
			case 'launch-requested':
				applyWorkflowEvent({
					type: 'launch-requested',
					modalOpen: event.modalOpen
				});
				break;
			case 'loaded-mods-changed':
				applyWorkflowEvent({ type: 'loaded-mods-changed', loadingMods: event.loadingMods });
				break;
			case 'mod-metadata-updated':
				applyWorkflowEvent({ type: 'mod-metadata-updated', loadingMods: event.loadingMods });
				break;
			case 'validate-requested':
				adapters.clearCollectionErrors();
				validateActiveDraft(workflowState.draft, false, event.options);
				break;
		}
	};

	return {
		dispatch,
		dispose: () => {
			disposed = true;
			invalidateCurrentValidationRequest();
			adapters.cancelValidation();
			listeners.clear();
		},
		getSnapshot,
		getWorkflowState: () => workflowState,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
}

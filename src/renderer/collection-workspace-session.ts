import {
	type AppConfig,
	type CollectionErrors,
	CollectionManagerModalType,
	type CollectionValidationOutcome,
	cloneCollection,
	type ModCollection
} from 'model';
import { getCollectionValidationKey, type ValidationIssueSummary } from './collection-validation-run';

type CollectionValidationStatus = 'none' | 'validating' | 'passed' | 'failed' | 'stale';

export type LaunchReadinessBlocker =
	| 'missing-draft'
	| 'loading-mods'
	| 'saving-draft'
	| 'validating-draft'
	| 'launching-game'
	| 'game-running'
	| 'validation-missing'
	| 'validation-stale'
	| 'validation-failed';

export interface CollectionWorkspaceValidationResult {
	draftKey: string;
	errors?: CollectionErrors;
	outcome?: CollectionValidationOutcome;
	success: boolean;
	summary?: ValidationIssueSummary;
}

export interface CollectionWorkspaceSessionInput {
	activeCollection?: ModCollection;
	config: AppConfig;
	gameRunning?: boolean;
	hasUnsavedDraft: boolean;
	launchingGame?: boolean;
	loadingMods?: boolean;
	savingDraft?: boolean;
	validatingDraft?: boolean;
	validationResult?: CollectionWorkspaceValidationResult;
}

export interface LaunchReadiness {
	blockers: LaunchReadinessBlocker[];
	ready: boolean;
}

interface CollectionLaunchCommandState {
	disabled: boolean;
	reason?: string;
}

type CollectionLaunchWorkflowAction = 'none' | 'launch-current-draft' | 'validate-current-draft';
type CollectionValidationCompletionAction = 'discard-stale-result' | 'persist-current-draft' | 'record-failed-result';
type CollectionValidationPersistenceAction = 'discard-stale-result' | 'record-and-launch-current-draft' | 'record-current-result';

interface CollectionDraftEditWorkflowDecision {
	shouldCancelValidation: boolean;
	shouldOpenBlockedModManagerDeselectDialog: boolean;
}

interface LoadedModsValidationDecision {
	nextHasValidatedLoadedMods: boolean;
	shouldRecalculateModData: boolean;
	shouldValidateActiveCollection: boolean;
}

export interface CollectionWorkspaceWorkflowState {
	config: AppConfig;
	draft?: ModCollection;
	hasUnsavedDraft: boolean;
	hasValidatedLoadedMods: boolean;
	pendingLaunchAfterSaveDraftKey?: string;
	validationLaunchIfValid?: boolean;
	validationResult?: CollectionWorkspaceValidationResult;
	validatingDraft: boolean;
}

export type CollectionWorkspaceWorkflowEffect =
	| {
			type: 'cancel-validation';
	  }
	| {
			type: 'open-blocked-mod-manager-deselect-dialog';
	  }
	| {
			type: 'recalculate-mod-data';
	  }
	| {
			launchIfValid: boolean;
			type: 'validate-active-collection';
	  }
	| {
			type: 'persist-active-collection-draft';
	  }
	| {
			type: 'launch-current-draft';
	  }
	| {
			launchingGame: boolean;
			type: 'set-launching-game';
	  }
	| {
			modalType: CollectionManagerModalType;
			type: 'open-validation-modal';
	  }
	| {
			type: 'clear-collection-errors';
	  }
	| {
			type: 'clear-launching-game';
	  };

export type CollectionWorkspaceWorkflowEvent =
	| {
			edit: CollectionDraftEditResult;
			type: 'active-draft-edited';
	  }
	| {
			config: AppConfig;
			currentDraft?: ModCollection;
			type: 'active-draft-changed';
	  }
	| {
			config: AppConfig;
			currentDraft?: ModCollection;
			type: 'collection-lifecycle-result-applied';
	  }
	| {
			loadingMods?: boolean;
			type: 'loaded-mods-changed';
	  }
	| {
			loadingMods?: boolean;
			type: 'mod-metadata-updated';
	  }
	| {
			pureSave: boolean;
			savedCollection?: ModCollection;
			type: 'collection-content-save-completed';
			writeAccepted: boolean;
	  }
	| {
			launchIfValid: boolean;
			type: 'validation-started';
	  }
	| {
			modalType?: CollectionManagerModalType;
			result?: CollectionWorkspaceValidationResult;
			type: 'validation-completed';
	  }
	| {
			type: 'validation-cancelled';
	  }
	| {
			type: 'validation-failed-to-run';
	  }
	| {
			launchReadiness: LaunchReadiness;
			modalOpen?: boolean;
			type: 'launch-requested';
	  }
	| {
			launchReadiness: LaunchReadiness;
			modalOpen?: boolean;
			type: 'launch-anyway-requested';
	  }
	| {
			hasUnsavedDraft: boolean;
			type: 'has-unsaved-draft-changed';
	  };

export type CollectionContentSaveCompletion = Omit<
	Extract<CollectionWorkspaceWorkflowEvent, { type: 'collection-content-save-completed' }>,
	'type'
>;

interface CollectionWorkspaceWorkflowTransition {
	effects: CollectionWorkspaceWorkflowEffect[];
	state: CollectionWorkspaceWorkflowState;
}

export interface CollectionWorkspaceSession {
	currentCollectionErrors?: CollectionErrors;
	currentValidationOutcome?: CollectionValidationOutcome;
	currentValidationStatus?: boolean;
	draft?: ModCollection;
	draftKey?: string;
	hasUnsavedDraft: boolean;
	launchReadiness: LaunchReadiness;
	savingDraft: boolean;
	validationResult?: CollectionWorkspaceValidationResult;
	validationStatus: CollectionValidationStatus;
	validatingDraft: boolean;
}

export interface CollectionDraftEditResult {
	blockedModManagerDeselect: boolean;
	nextDraft?: ModCollection;
}

interface CollectionDraftEditWorkflow {
	blockedModManagerDeselect: boolean;
	nextDraft?: ModCollection;
	shouldMarkUnsavedDraft: boolean;
}

interface CollectionLaunchWorkflowDecision {
	action: CollectionLaunchWorkflowAction;
	commandState: CollectionLaunchCommandState;
}

interface CollectionLaunchRequestDecision extends CollectionLaunchWorkflowDecision {
	launchCollection?: ModCollection;
}

interface CollectionValidationCompletionDecision {
	action: CollectionValidationCompletionAction;
	validationResult?: CollectionWorkspaceValidationResult;
}

interface CollectionValidationPersistenceDecision {
	action: CollectionValidationPersistenceAction;
	launchCollection?: ModCollection;
}

export type CollectionValidationRunOutcome =
	| {
			type: 'cancelled';
	  }
	| {
			type: 'discarded-stale-result';
			validationResult?: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'missing-active-collection';
	  }
	| {
			type: 'recorded-current-result';
			validationResult: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'recorded-failed-result';
			modalType?: CollectionManagerModalType;
			validationResult: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'validation-run-failed';
	  };

function hasSameEnabledMods(currentMods: string[], nextMods: string[]) {
	return currentMods.length === nextMods.length && currentMods.every((uid, index) => uid === nextMods[index]);
}

function createDraftEditResult(collection: ModCollection, mods: string[], forceChanged = false): CollectionDraftEditResult {
	if (!forceChanged && hasSameEnabledMods(collection.mods, mods)) {
		return {
			blockedModManagerDeselect: false
		};
	}

	return {
		blockedModManagerDeselect: false,
		nextDraft: {
			...cloneCollection(collection),
			mods
		}
	};
}

function getValidationStatus(input: {
	draftKey?: string;
	validatingDraft?: boolean;
	validationResult?: CollectionWorkspaceValidationResult;
}): CollectionValidationStatus {
	if (input.validatingDraft) {
		return 'validating';
	}
	if (!input.draftKey || !input.validationResult) {
		return 'none';
	}
	if (input.validationResult.draftKey !== input.draftKey) {
		return 'stale';
	}

	return input.validationResult.success ? 'passed' : 'failed';
}

function getLaunchReadiness(input: {
	draftKey?: string;
	gameRunning?: boolean;
	launchingGame?: boolean;
	loadingMods?: boolean;
	savingDraft?: boolean;
	validatingDraft?: boolean;
	validationStatus: CollectionValidationStatus;
}) {
	const blockers: LaunchReadinessBlocker[] = [];

	if (!input.draftKey) {
		blockers.push('missing-draft');
	}
	if (input.loadingMods) {
		blockers.push('loading-mods');
	}
	if (input.savingDraft) {
		blockers.push('saving-draft');
	}
	if (input.validatingDraft) {
		blockers.push('validating-draft');
	}
	if (input.launchingGame) {
		blockers.push('launching-game');
	}
	if (input.gameRunning) {
		blockers.push('game-running');
	}
	if (input.validationStatus === 'none') {
		blockers.push('validation-missing');
	}
	if (input.validationStatus === 'stale') {
		blockers.push('validation-stale');
	}
	if (input.validationStatus === 'failed') {
		blockers.push('validation-failed');
	}

	return {
		blockers,
		ready: blockers.length === 0
	};
}

function getCurrentValidationStatus(validationStatus: CollectionValidationStatus) {
	if (validationStatus === 'passed') {
		return true;
	}
	if (validationStatus === 'failed') {
		return false;
	}

	return undefined;
}

export function getCollectionLaunchCommandState(input: {
	launchReadiness: LaunchReadiness;
	modalOpen?: boolean;
}): CollectionLaunchCommandState {
	if (input.modalOpen) {
		return {
			disabled: true
		};
	}

	if (input.launchReadiness.blockers.includes('launching-game')) {
		return {
			disabled: true,
			reason: 'Already launching game'
		};
	}
	if (input.launchReadiness.blockers.includes('game-running')) {
		return {
			disabled: true,
			reason: 'Game already running'
		};
	}
	if (input.launchReadiness.blockers.includes('loading-mods')) {
		return {
			disabled: true
		};
	}
	if (input.launchReadiness.blockers.includes('saving-draft')) {
		return {
			disabled: true,
			reason: 'Saving collection'
		};
	}
	if (input.launchReadiness.blockers.includes('validating-draft')) {
		return {
			disabled: true,
			reason: 'Validating collection'
		};
	}
	if (input.launchReadiness.blockers.includes('missing-draft')) {
		return {
			disabled: true
		};
	}

	return {
		disabled: false
	};
}

export function getCollectionLaunchWorkflowDecision(input: {
	hasActiveCollection: boolean;
	launchReadiness: LaunchReadiness;
	modalOpen?: boolean;
}): CollectionLaunchWorkflowDecision {
	const commandState = getCollectionLaunchCommandState(input);
	if (commandState.disabled) {
		return {
			action: 'none',
			commandState
		};
	}

	if (input.launchReadiness.ready && input.hasActiveCollection) {
		return {
			action: 'launch-current-draft',
			commandState
		};
	}

	return {
		action: 'validate-current-draft',
		commandState
	};
}

export function getCollectionLaunchRequestDecision(input: {
	activeCollection?: ModCollection;
	launchReadiness: LaunchReadiness;
	modalOpen?: boolean;
}): CollectionLaunchRequestDecision {
	const decision = getCollectionLaunchWorkflowDecision({
		hasActiveCollection: !!input.activeCollection,
		launchReadiness: input.launchReadiness,
		modalOpen: input.modalOpen
	});

	return {
		...decision,
		launchCollection:
			decision.action === 'launch-current-draft' && input.activeCollection ? cloneCollection(input.activeCollection) : undefined
	};
}

export function createCollectionWorkspaceValidationResult(input: {
	collection?: ModCollection;
	config: AppConfig;
	errors?: CollectionErrors;
	outcome?: CollectionValidationOutcome;
	success: boolean;
	summary?: ValidationIssueSummary;
}): CollectionWorkspaceValidationResult | undefined {
	const draftKey = getCollectionValidationKey(input.collection, input.config);
	if (!draftKey) {
		return undefined;
	}

	return {
		draftKey,
		errors: input.errors,
		outcome: input.outcome,
		success: input.success,
		summary: input.summary
	};
}

export function getCollectionValidationCompletionDecision(input: {
	activeCollection?: ModCollection;
	config: AppConfig;
	validationResult?: CollectionWorkspaceValidationResult;
}): CollectionValidationCompletionDecision {
	if (!input.validationResult) {
		return {
			action: 'discard-stale-result'
		};
	}

	const session = createCollectionWorkspaceSession({
		activeCollection: input.activeCollection,
		config: input.config,
		hasUnsavedDraft: false,
		validationResult: input.validationResult
	});
	if (session.validationStatus === 'stale') {
		return {
			action: 'discard-stale-result'
		};
	}

	return {
		action: input.validationResult.success ? 'persist-current-draft' : 'record-failed-result',
		validationResult: input.validationResult
	};
}

export function getCollectionValidationPersistenceDecision(input: {
	activeCollection?: ModCollection;
	config: AppConfig;
	launchIfValid: boolean;
	validationResult?: CollectionWorkspaceValidationResult;
}): CollectionValidationPersistenceDecision {
	if (!input.validationResult) {
		return {
			action: 'discard-stale-result'
		};
	}

	const session = createCollectionWorkspaceSession({
		activeCollection: input.activeCollection,
		config: input.config,
		hasUnsavedDraft: false,
		validationResult: input.validationResult
	});
	if (session.validationStatus === 'stale') {
		return {
			action: 'discard-stale-result'
		};
	}

	if (input.launchIfValid && session.launchReadiness.ready && input.activeCollection) {
		return {
			action: 'record-and-launch-current-draft',
			launchCollection: cloneCollection(input.activeCollection)
		};
	}

	return {
		action: 'record-current-result'
	};
}

export function toggleCollectionDraftMod(input: {
	checked: boolean;
	collection?: ModCollection;
	modManagerUid: string;
	uid: string;
}): CollectionDraftEditResult {
	if (!input.collection) {
		return {
			blockedModManagerDeselect: false
		};
	}

	if (input.checked) {
		if (input.collection.mods.includes(input.uid)) {
			return {
				blockedModManagerDeselect: false
			};
		}

		return createDraftEditResult(input.collection, [...input.collection.mods, input.uid], true);
	}

	if (input.uid === input.modManagerUid) {
		return {
			blockedModManagerDeselect: true
		};
	}

	return createDraftEditResult(
		input.collection,
		input.collection.mods.filter((mod) => mod !== input.uid),
		true
	);
}

function createCollectionDraftEditWorkflow(editResult: CollectionDraftEditResult): CollectionDraftEditWorkflow {
	if (!editResult.nextDraft) {
		return {
			blockedModManagerDeselect: editResult.blockedModManagerDeselect,
			shouldMarkUnsavedDraft: false
		};
	}

	const nextDraft = cloneCollection(editResult.nextDraft);
	return {
		blockedModManagerDeselect: editResult.blockedModManagerDeselect,
		nextDraft,
		shouldMarkUnsavedDraft: true
	};
}

function getCollectionDraftEditWorkflowDecision(workflow: CollectionDraftEditWorkflow): CollectionDraftEditWorkflowDecision {
	return {
		shouldCancelValidation: !!workflow.nextDraft,
		shouldOpenBlockedModManagerDeselectDialog: workflow.blockedModManagerDeselect
	};
}

export function setCollectionDraftEnabledMods(input: {
	collection?: ModCollection;
	enabledMods: Set<string>;
	modManagerUid: string;
}): CollectionDraftEditResult {
	if (!input.collection) {
		return {
			blockedModManagerDeselect: false
		};
	}

	const nextMods = Array.from(new Set([...input.enabledMods, input.modManagerUid])).sort();
	return createDraftEditResult(input.collection, nextMods);
}

export function setCollectionDraftModSubset(input: {
	changes: { [uid: string]: boolean };
	collection?: ModCollection;
	modManagerUid: string;
}): CollectionDraftEditResult {
	if (!input.collection) {
		return {
			blockedModManagerDeselect: false
		};
	}

	const nextSelection = new Set(input.collection.mods);
	let changed = false;
	let blockedModManagerDeselect = false;

	Object.entries(input.changes).forEach(([uid, checked]) => {
		if (checked) {
			if (!nextSelection.has(uid)) {
				nextSelection.add(uid);
				changed = true;
			}
		} else if (uid === input.modManagerUid) {
			blockedModManagerDeselect = true;
		} else if (nextSelection.delete(uid)) {
			changed = true;
		}
	});

	if (!changed) {
		return {
			blockedModManagerDeselect
		};
	}

	return {
		...createDraftEditResult(input.collection, Array.from(nextSelection).sort()),
		blockedModManagerDeselect
	};
}

export function getLoadedModsValidationDecision(input: {
	hasValidatedLoadedMods: boolean;
	loadingMods?: boolean;
}): LoadedModsValidationDecision {
	if (input.loadingMods) {
		return {
			nextHasValidatedLoadedMods: false,
			shouldRecalculateModData: false,
			shouldValidateActiveCollection: false
		};
	}

	return {
		nextHasValidatedLoadedMods: true,
		shouldRecalculateModData: !input.hasValidatedLoadedMods,
		shouldValidateActiveCollection: !input.hasValidatedLoadedMods
	};
}

function getLaunchContinuationDraftKey(state: CollectionWorkspaceWorkflowState) {
	return state.draft ? getCollectionValidationKey(state.draft, state.config) : undefined;
}

function requestLaunchAfterSave(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	draftKey = getLaunchContinuationDraftKey(state)
) {
	if (!draftKey) {
		return;
	}
	state.pendingLaunchAfterSaveDraftKey = draftKey;
	effects.push({ type: 'persist-active-collection-draft' });
}

export function createCollectionWorkspaceWorkflowState(
	input: Partial<CollectionWorkspaceWorkflowState> = {}
): CollectionWorkspaceWorkflowState {
	return {
		config: input.config ?? ({} as AppConfig),
		draft: input.draft ? cloneCollection(input.draft) : undefined,
		hasUnsavedDraft: !!input.hasUnsavedDraft,
		hasValidatedLoadedMods: !!input.hasValidatedLoadedMods,
		pendingLaunchAfterSaveDraftKey: input.pendingLaunchAfterSaveDraftKey,
		validationLaunchIfValid: input.validationLaunchIfValid,
		validationResult: input.validationResult,
		validatingDraft: !!input.validatingDraft
	};
}

function cloneWorkflowState(state: CollectionWorkspaceWorkflowState): CollectionWorkspaceWorkflowState {
	return createCollectionWorkspaceWorkflowState(state);
}

function isSameCollectionDraft(current: ModCollection | undefined, next: ModCollection | undefined) {
	return current?.name === next?.name && hasSameEnabledMods(current?.mods ?? [], next?.mods ?? []);
}

function isSameWorkflowState(current: CollectionWorkspaceWorkflowState, next: CollectionWorkspaceWorkflowState) {
	return (
		current.config === next.config &&
		isSameCollectionDraft(current.draft, next.draft) &&
		current.hasUnsavedDraft === next.hasUnsavedDraft &&
		current.hasValidatedLoadedMods === next.hasValidatedLoadedMods &&
		current.pendingLaunchAfterSaveDraftKey === next.pendingLaunchAfterSaveDraftKey &&
		current.validationLaunchIfValid === next.validationLaunchIfValid &&
		current.validationResult === next.validationResult &&
		current.validatingDraft === next.validatingDraft
	);
}

export function reduceCollectionWorkspaceWorkflow(
	state: CollectionWorkspaceWorkflowState,
	event: CollectionWorkspaceWorkflowEvent
): CollectionWorkspaceWorkflowTransition {
	const nextState = cloneWorkflowState(state);
	const effects: CollectionWorkspaceWorkflowEffect[] = [];

	switch (event.type) {
		case 'launch-requested': {
			const decision = getCollectionLaunchWorkflowDecision({
				hasActiveCollection: !!nextState.draft,
				launchReadiness: event.launchReadiness,
				modalOpen: event.modalOpen
			});
			if (decision.action === 'none') {
				break;
			}
			if (event.launchReadiness.blockers.includes('validation-failed')) {
				effects.push({ type: 'open-validation-modal', modalType: CollectionManagerModalType.ERRORS_FOUND });
				break;
			}
			effects.push({ type: 'set-launching-game', launchingGame: true });
			if (decision.action === 'launch-current-draft' && nextState.validationResult) {
				requestLaunchAfterSave(nextState, effects, nextState.validationResult.draftKey);
				break;
			}
			effects.push({ type: 'clear-collection-errors' });
			effects.push({ type: 'validate-active-collection', launchIfValid: true });
			break;
		}
		case 'launch-anyway-requested': {
			const commandState = getCollectionLaunchCommandState({
				launchReadiness: event.launchReadiness
			});
			if (commandState.disabled) {
				effects.push({ type: 'clear-launching-game' });
				break;
			}
			effects.push({ type: 'set-launching-game', launchingGame: true });
			if (nextState.hasUnsavedDraft) {
				requestLaunchAfterSave(nextState, effects);
				break;
			}
			effects.push({ type: 'launch-current-draft' });
			break;
		}
		case 'active-draft-edited': {
			const workflow = createCollectionDraftEditWorkflow(event.edit);
			const decision = getCollectionDraftEditWorkflowDecision(workflow);
			if (decision.shouldOpenBlockedModManagerDeselectDialog) {
				effects.push({ type: 'open-blocked-mod-manager-deselect-dialog' });
			}
			if (decision.shouldCancelValidation) {
				effects.push({ type: 'cancel-validation' });
				nextState.validatingDraft = false;
				nextState.validationLaunchIfValid = undefined;
			}
			if (workflow.shouldMarkUnsavedDraft) {
				nextState.hasUnsavedDraft = true;
			}
			if (workflow.nextDraft) {
				nextState.draft = cloneCollection(workflow.nextDraft);
			}
			if (workflow.nextDraft) {
				effects.push({ type: 'validate-active-collection', launchIfValid: false });
			}
			break;
		}
		case 'has-unsaved-draft-changed': {
			nextState.hasUnsavedDraft = event.hasUnsavedDraft;
			break;
		}
		case 'active-draft-changed': {
			nextState.config = event.config;
			if (!nextState.hasUnsavedDraft) {
				nextState.draft = event.currentDraft ? cloneCollection(event.currentDraft) : undefined;
			}
			break;
		}
		case 'loaded-mods-changed': {
			const decision = getLoadedModsValidationDecision({
				hasValidatedLoadedMods: nextState.hasValidatedLoadedMods,
				loadingMods: event.loadingMods
			});
			nextState.hasValidatedLoadedMods = decision.nextHasValidatedLoadedMods;
			if (decision.shouldRecalculateModData) {
				effects.push({ type: 'recalculate-mod-data' });
			}
			if (decision.shouldValidateActiveCollection) {
				effects.push({ type: 'validate-active-collection', launchIfValid: false });
			}
			break;
		}
		case 'mod-metadata-updated': {
			effects.push({ type: 'recalculate-mod-data' });
			if (!event.loadingMods) {
				effects.push({ type: 'validate-active-collection', launchIfValid: false });
			}
			break;
		}
		case 'collection-content-save-completed': {
			if (event.writeAccepted && event.savedCollection) {
				nextState.draft = cloneCollection(event.savedCollection);
				nextState.hasUnsavedDraft = false;
			}
			if (!event.writeAccepted) {
				nextState.hasUnsavedDraft = nextState.hasUnsavedDraft;
			}
			if (nextState.pendingLaunchAfterSaveDraftKey) {
				if (
					event.writeAccepted &&
					event.savedCollection &&
					getCollectionValidationKey(event.savedCollection, nextState.config) === nextState.pendingLaunchAfterSaveDraftKey
				) {
					effects.push({ type: 'launch-current-draft' });
				} else {
					effects.push({ type: 'clear-launching-game' });
				}
				nextState.pendingLaunchAfterSaveDraftKey = undefined;
			}
			break;
		}
		case 'collection-lifecycle-result-applied': {
			nextState.config = event.config;
			nextState.draft = event.currentDraft ? cloneCollection(event.currentDraft) : undefined;
			nextState.hasUnsavedDraft = false;
			nextState.pendingLaunchAfterSaveDraftKey = undefined;
			nextState.validationLaunchIfValid = undefined;
			nextState.validationResult = undefined;
			nextState.validatingDraft = false;
			break;
		}
		case 'validation-started': {
			nextState.validatingDraft = true;
			nextState.validationLaunchIfValid = event.launchIfValid;
			break;
		}
		case 'validation-completed': {
			const launchIfValid = nextState.validationLaunchIfValid;
			nextState.validatingDraft = false;
			nextState.validationLaunchIfValid = undefined;
			if (!event.result) {
				break;
			}
			const session = createCollectionWorkspaceSession({
				activeCollection: nextState.draft,
				config: nextState.config,
				hasUnsavedDraft: nextState.hasUnsavedDraft,
				validationResult: event.result
			});
			if (session.validationStatus === 'stale') {
				break;
			}
			nextState.validationResult = event.result;
			if (launchIfValid) {
				if (event.result.success) {
					requestLaunchAfterSave(nextState, effects, event.result.draftKey);
				} else {
					if (event.modalType) {
						effects.push({ type: 'open-validation-modal', modalType: event.modalType });
					}
					effects.push({ type: 'clear-launching-game' });
				}
			}
			break;
		}
		case 'validation-cancelled': {
			nextState.validatingDraft = false;
			nextState.validationLaunchIfValid = undefined;
			break;
		}
		case 'validation-failed-to-run': {
			if (nextState.validationLaunchIfValid) {
				effects.push({ type: 'clear-launching-game' });
			}
			nextState.validatingDraft = false;
			nextState.validationLaunchIfValid = undefined;
			break;
		}
	}

	return {
		effects,
		state: effects.length === 0 && isSameWorkflowState(state, nextState) ? state : nextState
	};
}

export function applyCollectionContentSaveResult(input: { hasUnsavedDraft: boolean; pureSave: boolean; writeAccepted: boolean }) {
	return {
		hasUnsavedDraft: input.writeAccepted ? false : input.hasUnsavedDraft
	};
}

export function getCollectionLifecycleDirtyDraft(input: { draft?: ModCollection; hasUnsavedDraft: boolean }) {
	return input.hasUnsavedDraft && input.draft ? cloneCollection(input.draft) : undefined;
}

export function createCollectionWorkspaceSession(input: CollectionWorkspaceSessionInput): CollectionWorkspaceSession {
	const draft = input.activeCollection ? cloneCollection(input.activeCollection) : undefined;
	const draftKey = getCollectionValidationKey(draft, input.config);
	const validationStatus = getValidationStatus({
		draftKey,
		validatingDraft: input.validatingDraft,
		validationResult: input.validationResult
	});

	return {
		currentCollectionErrors: validationStatus === 'passed' || validationStatus === 'failed' ? input.validationResult?.errors : undefined,
		currentValidationOutcome: validationStatus === 'passed' || validationStatus === 'failed' ? input.validationResult?.outcome : undefined,
		currentValidationStatus: getCurrentValidationStatus(validationStatus),
		draft,
		draftKey,
		hasUnsavedDraft: input.hasUnsavedDraft,
		launchReadiness: getLaunchReadiness({
			draftKey,
			gameRunning: input.gameRunning,
			launchingGame: input.launchingGame,
			loadingMods: input.loadingMods,
			savingDraft: input.savingDraft,
			validatingDraft: input.validatingDraft,
			validationStatus
		}),
		savingDraft: !!input.savingDraft,
		validationResult: input.validationResult,
		validationStatus,
		validatingDraft: !!input.validatingDraft
	};
}

import { type AppConfig, CollectionManagerModalType, cloneCollection, type ModCollection } from 'model';
import { getCollectionValidationKey } from './collection-validation-run';
import {
	type ActiveCollectionDraftRuntimeFacts,
	getCollectionLaunchCommandState,
	getCollectionLaunchWorkflowDecision,
	IDLE_ACTIVE_COLLECTION_DRAFT_RUNTIME_FACTS,
	sameActiveCollectionDraftRuntimeFacts
} from './collection-workspace-runtime';
import { type CollectionWorkspaceValidationResult, createCollectionWorkspaceSession } from './collection-workspace-session-policy';

export {
	type ActiveCollectionDraftRuntimeFacts,
	getCollectionLaunchCommandState,
	getCollectionLaunchRequestDecision,
	getCollectionLaunchWorkflowDecision,
	type LaunchReadinessBlocker
} from './collection-workspace-runtime';
export type {
	CollectionWorkspaceSession,
	CollectionWorkspaceValidationResult
} from './collection-workspace-session-policy';
export {
	createCollectionWorkspaceSession,
	createCollectionWorkspaceValidationResult,
	getCollectionValidationCompletionDecision,
	getCollectionValidationPersistenceDecision
} from './collection-workspace-session-policy';

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
	draftGeneration: number;
	inventoryRevision: number;
	validationRunKey?: string;
	pendingLaunchAfterSaveDraftKey?: string;
	runtimeFacts: ActiveCollectionDraftRuntimeFacts;
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
			type: 'inventory-changed';
	  }
	| {
			loadingMods?: boolean;
			type: 'mod-metadata-updated';
	  }
	| {
			pureSave: boolean;
			draftGeneration?: number;
			savedCollection?: ModCollection;
			type: 'collection-content-save-completed';
			writeAccepted: boolean;
	  }
	| {
			launchIfValid: boolean;
			runKey?: string;
			type: 'validation-started';
	  }
	| {
			modalType?: CollectionManagerModalType;
			result?: CollectionWorkspaceValidationResult;
			type: 'validation-completed';
	  }
	| { type: 'validation-superseded' }
	| {
			type: 'validation-cancelled';
	  }
	| {
			type: 'validation-failed-to-run';
	  }
	| {
			modalOpen?: boolean;
			type: 'launch-requested';
	  }
	| {
			modalOpen?: boolean;
			type: 'launch-anyway-requested';
	  }
	| {
			hasUnsavedDraft: boolean;
			type: 'has-unsaved-draft-changed';
	  }
	| {
			facts: ActiveCollectionDraftRuntimeFacts;
			type: 'runtime-facts-changed';
	  };

export type CollectionContentSaveCompletion = Omit<
	Extract<CollectionWorkspaceWorkflowEvent, { type: 'collection-content-save-completed' }>,
	'type'
>;

interface CollectionWorkspaceWorkflowTransition {
	effects: CollectionWorkspaceWorkflowEffect[];
	state: CollectionWorkspaceWorkflowState;
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

function setWorkflowLaunchingGame(state: CollectionWorkspaceWorkflowState, launchingGame: boolean) {
	state.runtimeFacts = {
		...state.runtimeFacts,
		launchingGame
	};
}

function invalidateValidation(state: CollectionWorkspaceWorkflowState, effects: CollectionWorkspaceWorkflowEffect[]) {
	if (state.validatingDraft) effects.push({ type: 'cancel-validation' });
	if (state.validationLaunchIfValid || state.pendingLaunchAfterSaveDraftKey) {
		setWorkflowLaunchingGame(state, false);
		effects.push({ type: 'clear-launching-game' });
	}
	state.pendingLaunchAfterSaveDraftKey = undefined;
	state.validatingDraft = false;
	state.validationLaunchIfValid = undefined;
	state.validationRunKey = undefined;
}

function createCollectionWorkspaceSessionFromWorkflowState(state: CollectionWorkspaceWorkflowState) {
	return createCollectionWorkspaceSession({
		activeCollection: state.draft,
		config: state.config,
		hasUnsavedDraft: state.hasUnsavedDraft,
		runtimeFacts: state.runtimeFacts,
		inventoryRevision: state.inventoryRevision,
		validatingDraft: state.validatingDraft,
		validationResult: state.validationResult
	});
}

function continueDraftLaunchRequest(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	input: {
		modalOpen?: boolean;
	}
) {
	const launchReadiness = createCollectionWorkspaceSessionFromWorkflowState(state).launchReadiness;
	const decision = getCollectionLaunchWorkflowDecision({
		hasActiveCollection: !!state.draft,
		launchReadiness,
		modalOpen: input.modalOpen
	});
	if (decision.action === 'none') {
		return;
	}

	if (launchReadiness.blockers.includes('validation-failed')) {
		effects.push({ type: 'open-validation-modal', modalType: CollectionManagerModalType.ERRORS_FOUND });
		return;
	}

	setWorkflowLaunchingGame(state, true);
	effects.push({ type: 'set-launching-game', launchingGame: true });

	if (decision.action === 'launch-current-draft' && state.validationResult) {
		requestLaunchAfterSave(state, effects, state.validationResult.draftKey);
		return;
	}

	effects.push({ type: 'clear-collection-errors' });
	effects.push({ type: 'validate-active-collection', launchIfValid: true });
}

function continueDraftLaunchAnywayRequest(state: CollectionWorkspaceWorkflowState, effects: CollectionWorkspaceWorkflowEffect[]) {
	const launchReadiness = createCollectionWorkspaceSessionFromWorkflowState(state).launchReadiness;
	const commandState = getCollectionLaunchCommandState({
		launchReadiness
	});
	if (commandState.disabled) {
		setWorkflowLaunchingGame(state, false);
		effects.push({ type: 'clear-launching-game' });
		return;
	}

	setWorkflowLaunchingGame(state, true);
	effects.push({ type: 'set-launching-game', launchingGame: true });
	if (state.hasUnsavedDraft) {
		requestLaunchAfterSave(state, effects);
		return;
	}
	effects.push({ type: 'launch-current-draft' });
}

function continueDraftLaunchAfterValidation(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	input: {
		modalType?: CollectionManagerModalType;
		result?: CollectionWorkspaceValidationResult;
	}
) {
	const launchIfValid = state.validationLaunchIfValid;
	state.validatingDraft = false;
	state.validationLaunchIfValid = undefined;
	if (!input.result) {
		return;
	}
	const session = createCollectionWorkspaceSession({
		activeCollection: state.draft,
		config: state.config,
		hasUnsavedDraft: state.hasUnsavedDraft,
		validationResult: input.result,
		inventoryRevision: state.inventoryRevision
	});
	if (session.validationStatus === 'stale') {
		return;
	}
	state.validationResult = input.result;
	if (!launchIfValid) {
		return;
	}
	if (input.result.success) {
		requestLaunchAfterSave(state, effects, input.result.draftKey);
		return;
	}
	if (input.modalType) {
		effects.push({ type: 'open-validation-modal', modalType: input.modalType });
	}
	setWorkflowLaunchingGame(state, false);
	effects.push({ type: 'clear-launching-game' });
}

function continueDraftLaunchAfterSave(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	input: CollectionContentSaveCompletion
) {
	if (input.draftGeneration !== undefined && input.draftGeneration !== state.draftGeneration) return;
	if (
		input.writeAccepted &&
		input.savedCollection &&
		(!state.hasUnsavedDraft || isSameCollectionDraft(state.draft, input.savedCollection))
	) {
		state.draft = cloneCollection(input.savedCollection);
		state.hasUnsavedDraft = false;
	}
	if (!state.pendingLaunchAfterSaveDraftKey) {
		return;
	}
	if (
		input.writeAccepted &&
		input.savedCollection &&
		getCollectionValidationKey(input.savedCollection, state.config) === state.pendingLaunchAfterSaveDraftKey
	) {
		effects.push({ type: 'launch-current-draft' });
	} else {
		setWorkflowLaunchingGame(state, false);
		effects.push({ type: 'clear-launching-game' });
	}
	state.pendingLaunchAfterSaveDraftKey = undefined;
}

export function createCollectionWorkspaceWorkflowState(
	input: Partial<CollectionWorkspaceWorkflowState> = {}
): CollectionWorkspaceWorkflowState {
	return {
		config: input.config ?? ({} as AppConfig),
		draft: input.draft ? cloneCollection(input.draft) : undefined,
		hasUnsavedDraft: !!input.hasUnsavedDraft,
		hasValidatedLoadedMods: !!input.hasValidatedLoadedMods,
		draftGeneration: input.draftGeneration ?? 0,
		inventoryRevision: input.inventoryRevision ?? 0,
		validationRunKey: input.validationRunKey,
		pendingLaunchAfterSaveDraftKey: input.pendingLaunchAfterSaveDraftKey,
		runtimeFacts: input.runtimeFacts ?? IDLE_ACTIVE_COLLECTION_DRAFT_RUNTIME_FACTS,
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
		current.draftGeneration === next.draftGeneration &&
		current.inventoryRevision === next.inventoryRevision &&
		current.validationRunKey === next.validationRunKey &&
		current.pendingLaunchAfterSaveDraftKey === next.pendingLaunchAfterSaveDraftKey &&
		sameActiveCollectionDraftRuntimeFacts(current.runtimeFacts, next.runtimeFacts) &&
		current.validationLaunchIfValid === next.validationLaunchIfValid &&
		current.validationResult === next.validationResult &&
		current.validatingDraft === next.validatingDraft
	);
}

function applyDraftEdit(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	event: Extract<CollectionWorkspaceWorkflowEvent, { type: 'active-draft-edited' }>
) {
	const workflow = createCollectionDraftEditWorkflow(event.edit);
	const decision = getCollectionDraftEditWorkflowDecision(workflow);
	if (decision.shouldOpenBlockedModManagerDeselectDialog) {
		effects.push({ type: 'open-blocked-mod-manager-deselect-dialog' });
	}
	if (decision.shouldCancelValidation) {
		if (state.validationLaunchIfValid || state.pendingLaunchAfterSaveDraftKey) {
			setWorkflowLaunchingGame(state, false);
			effects.push({ type: 'clear-launching-game' });
		}
		state.pendingLaunchAfterSaveDraftKey = undefined;
		effects.push({ type: 'cancel-validation' });
		state.validatingDraft = false;
		state.validationLaunchIfValid = undefined;
	}
	if (workflow.shouldMarkUnsavedDraft) {
		state.hasUnsavedDraft = true;
	}
	if (workflow.nextDraft) {
		state.draftGeneration += 1;
		state.draft = cloneCollection(workflow.nextDraft);
	}
	if (workflow.nextDraft) {
		effects.push({ type: 'validate-active-collection', launchIfValid: false });
	}
}

function applyDraftRefresh(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	event: Extract<CollectionWorkspaceWorkflowEvent, { type: 'active-draft-changed' }>
) {
	const previousKey = getCollectionValidationKey(state.draft, state.config);
	state.config = event.config;
	if (!state.hasUnsavedDraft) {
		if (!isSameCollectionDraft(state.draft, event.currentDraft)) state.draftGeneration += 1;
		state.draft = event.currentDraft ? cloneCollection(event.currentDraft) : undefined;
	}
	const nextKey = getCollectionValidationKey(state.draft, state.config);
	if (previousKey !== nextKey && (!state.validatingDraft || state.validationRunKey !== nextKey)) {
		invalidateValidation(state, effects);
	}
}

function applyLoadedModsChange(
	state: CollectionWorkspaceWorkflowState,
	effects: CollectionWorkspaceWorkflowEffect[],
	event: Extract<CollectionWorkspaceWorkflowEvent, { type: 'loaded-mods-changed' }>
) {
	const decision = getLoadedModsValidationDecision({
		hasValidatedLoadedMods: state.hasValidatedLoadedMods,
		loadingMods: event.loadingMods
	});
	state.runtimeFacts = {
		...state.runtimeFacts,
		loadingMods: !!event.loadingMods
	};
	state.hasValidatedLoadedMods = decision.nextHasValidatedLoadedMods;
	if (decision.shouldRecalculateModData) {
		effects.push({ type: 'recalculate-mod-data' });
	}
	if (decision.shouldValidateActiveCollection) {
		effects.push({ type: 'validate-active-collection', launchIfValid: false });
	}
}

export function reduceCollectionWorkspaceWorkflow(
	state: CollectionWorkspaceWorkflowState,
	event: CollectionWorkspaceWorkflowEvent
): CollectionWorkspaceWorkflowTransition {
	const nextState = cloneWorkflowState(state);
	const effects: CollectionWorkspaceWorkflowEffect[] = [];

	switch (event.type) {
		case 'launch-requested': {
			continueDraftLaunchRequest(nextState, effects, {
				modalOpen: event.modalOpen
			});
			break;
		}
		case 'launch-anyway-requested': {
			continueDraftLaunchAnywayRequest(nextState, effects);
			break;
		}
		case 'active-draft-edited': {
			applyDraftEdit(nextState, effects, event);
			break;
		}
		case 'has-unsaved-draft-changed': {
			nextState.hasUnsavedDraft = event.hasUnsavedDraft;
			break;
		}
		case 'runtime-facts-changed': {
			nextState.runtimeFacts = event.facts;
			break;
		}
		case 'active-draft-changed': {
			applyDraftRefresh(nextState, effects, event);
			break;
		}
		case 'inventory-changed': {
			nextState.inventoryRevision += 1;
			invalidateValidation(nextState, effects);
			break;
		}
		case 'loaded-mods-changed': {
			applyLoadedModsChange(nextState, effects, event);
			break;
		}
		case 'mod-metadata-updated': {
			if (event.loadingMods !== undefined) {
				nextState.runtimeFacts = {
					...nextState.runtimeFacts,
					loadingMods: event.loadingMods
				};
			}
			effects.push({ type: 'recalculate-mod-data' });
			if (!event.loadingMods) {
				effects.push({ type: 'validate-active-collection', launchIfValid: false });
			}
			break;
		}
		case 'collection-content-save-completed': {
			continueDraftLaunchAfterSave(nextState, effects, event);
			break;
		}
		case 'collection-lifecycle-result-applied': {
			nextState.draftGeneration += 1;
			invalidateValidation(nextState, effects);
			nextState.inventoryRevision += 1;
			nextState.config = event.config;
			nextState.draft = event.currentDraft ? cloneCollection(event.currentDraft) : undefined;
			nextState.hasUnsavedDraft = false;
			nextState.pendingLaunchAfterSaveDraftKey = undefined;
			nextState.validationLaunchIfValid = undefined;
			nextState.validatingDraft = false;
			break;
		}
		case 'validation-started': {
			nextState.validatingDraft = true;
			nextState.validationRunKey = event.runKey;
			nextState.validationLaunchIfValid = event.launchIfValid;
			break;
		}
		case 'validation-completed': {
			continueDraftLaunchAfterValidation(nextState, effects, event);
			break;
		}
		case 'validation-superseded': {
			invalidateValidation(nextState, effects);
			break;
		}
		case 'validation-cancelled': {
			nextState.validatingDraft = false;
			nextState.validationLaunchIfValid = undefined;
			break;
		}
		case 'validation-failed-to-run': {
			if (nextState.validationLaunchIfValid) {
				setWorkflowLaunchingGame(nextState, false);
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

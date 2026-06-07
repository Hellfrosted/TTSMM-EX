import type { ModCollection } from 'model';
import { cloneCollection } from 'model';

export type CollectionValidationStatus = 'none' | 'validating' | 'passed' | 'failed' | 'stale';

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

export interface ActiveCollectionDraftRuntimeFacts {
	gameRunning: boolean;
	launchingGame: boolean;
	loadingMods: boolean;
	overrideGameRunning?: boolean;
	savingDraft: boolean;
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

interface CollectionLaunchWorkflowDecision {
	action: CollectionLaunchWorkflowAction;
	commandState: CollectionLaunchCommandState;
}

interface CollectionLaunchRequestDecision extends CollectionLaunchWorkflowDecision {
	launchCollection?: ModCollection;
}

export const IDLE_ACTIVE_COLLECTION_DRAFT_RUNTIME_FACTS: ActiveCollectionDraftRuntimeFacts = {
	gameRunning: false,
	launchingGame: false,
	loadingMods: false,
	savingDraft: false
};

export function getLaunchReadiness(input: {
	draftKey?: string;
	runtimeFacts: ActiveCollectionDraftRuntimeFacts;
	validatingDraft?: boolean;
	validationStatus: CollectionValidationStatus;
}) {
	const blockers: LaunchReadinessBlocker[] = [];

	if (!input.draftKey) {
		blockers.push('missing-draft');
	}
	if (input.runtimeFacts.loadingMods) {
		blockers.push('loading-mods');
	}
	if (input.runtimeFacts.savingDraft) {
		blockers.push('saving-draft');
	}
	if (input.validatingDraft) {
		blockers.push('validating-draft');
	}
	if (input.runtimeFacts.launchingGame) {
		blockers.push('launching-game');
	}
	if (input.runtimeFacts.gameRunning || input.runtimeFacts.overrideGameRunning) {
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

export function sameActiveCollectionDraftRuntimeFacts(current: ActiveCollectionDraftRuntimeFacts, next: ActiveCollectionDraftRuntimeFacts) {
	return (
		current.gameRunning === next.gameRunning &&
		current.launchingGame === next.launchingGame &&
		current.loadingMods === next.loadingMods &&
		current.overrideGameRunning === next.overrideGameRunning &&
		current.savingDraft === next.savingDraft
	);
}

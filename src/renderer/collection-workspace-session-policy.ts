import { type AppConfig, type CollectionErrors, type CollectionValidationOutcome, cloneCollection, type ModCollection } from 'model';
import { getCollectionValidationKey, type ValidationIssueSummary } from './collection-validation-run';
import {
	type ActiveCollectionDraftRuntimeFacts,
	type CollectionValidationStatus,
	getLaunchReadiness,
	type LaunchReadiness
} from './collection-workspace-runtime';

type CollectionValidationCompletionAction = 'discard-stale-result' | 'persist-current-draft' | 'record-failed-result';
type CollectionValidationPersistenceAction = 'discard-stale-result' | 'record-and-launch-current-draft' | 'record-current-result';

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
	runtimeFacts?: ActiveCollectionDraftRuntimeFacts;
	savingDraft?: boolean;
	validatingDraft?: boolean;
	validationResult?: CollectionWorkspaceValidationResult;
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

type CollectionValidationCompletionDecision =
	| {
			action: 'discard-stale-result';
	  }
	| {
			action: Exclude<CollectionValidationCompletionAction, 'discard-stale-result'>;
			validationResult: CollectionWorkspaceValidationResult;
	  };

interface CollectionValidationPersistenceDecision {
	action: CollectionValidationPersistenceAction;
	launchCollection?: ModCollection;
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

function getCurrentValidationStatus(validationStatus: CollectionValidationStatus) {
	if (validationStatus === 'passed') {
		return true;
	}
	if (validationStatus === 'failed') {
		return false;
	}

	return undefined;
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

export function createCollectionWorkspaceSession(input: CollectionWorkspaceSessionInput): CollectionWorkspaceSession {
	const draft = input.activeCollection ? cloneCollection(input.activeCollection) : undefined;
	const draftKey = getCollectionValidationKey(draft, input.config);
	const runtimeFacts = input.runtimeFacts ?? {
		gameRunning: !!input.gameRunning,
		launchingGame: !!input.launchingGame,
		loadingMods: !!input.loadingMods,
		savingDraft: !!input.savingDraft
	};
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
			runtimeFacts,
			validatingDraft: input.validatingDraft,
			validationStatus
		}),
		savingDraft: runtimeFacts.savingDraft,
		validationResult: input.validationResult,
		validationStatus,
		validatingDraft: !!input.validatingDraft
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

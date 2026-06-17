import type { ModCollection } from 'model';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { CollectionValidationRunOutcome, CollectionWorkspaceWorkflowEvent } from './collection-workspace-workflow';

type ApplyWorkflowEvent = (event: CollectionWorkspaceWorkflowEvent) => void;
type ValidateDraft = (
	draft: ModCollection | undefined,
	launchIfValid: boolean,
	options?: { config?: CollectionWorkspaceAppState['config'] }
) => Promise<CollectionValidationRunOutcome>;

export interface ActiveCollectionDraftValidationCoordinatorOptions {
	readonly applyWorkflowEvent: ApplyWorkflowEvent;
	readonly cancelValidation: () => void;
	readonly validateDraft: ValidateDraft;
}

export interface ActiveCollectionDraftValidationCoordinator {
	cancel(): void;
	dispose(): void;
	validate(draft: ModCollection | undefined, launchIfValid: boolean, options?: { config?: CollectionWorkspaceAppState['config'] }): void;
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

export function createActiveCollectionDraftValidationCoordinator({
	applyWorkflowEvent,
	cancelValidation,
	validateDraft
}: ActiveCollectionDraftValidationCoordinatorOptions): ActiveCollectionDraftValidationCoordinator {
	let disposed = false;
	let validationRequestId = 0;

	const isCurrentRequest = (requestId: number) => !disposed && requestId === validationRequestId;

	const invalidateCurrentRequest = () => {
		validationRequestId += 1;
	};

	const applyAcceptedOutcome = (requestId: number, outcome: CollectionValidationRunOutcome) => {
		if (!isCurrentRequest(requestId)) {
			return;
		}
		applyWorkflowEvent(workflowEventFromValidationOutcome(outcome));
	};

	return {
		cancel: () => {
			invalidateCurrentRequest();
			cancelValidation();
		},
		dispose: () => {
			disposed = true;
			invalidateCurrentRequest();
			cancelValidation();
		},
		validate: (draft, launchIfValid, options) => {
			if (disposed) {
				return;
			}
			const requestId = validationRequestId + 1;
			validationRequestId = requestId;
			applyWorkflowEvent({ type: 'validation-started', launchIfValid });
			void validateDraft(draft, launchIfValid, options)
				.then((outcome) => {
					applyAcceptedOutcome(requestId, outcome);
				})
				.catch(() => {
					applyAcceptedOutcome(requestId, { type: 'validation-run-failed' });
				});
		}
	};
}

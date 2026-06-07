import { type AppConfig, CollectionManagerModalType, type ModCollection } from 'model';
import {
	type CollectionValidationRunOutcome,
	type CollectionWorkspaceValidationResult,
	getCollectionValidationCompletionDecision
} from './collection-workspace-session';

type CollectionValidationResultRunOutcome = Extract<
	CollectionValidationRunOutcome,
	{ type: 'discarded-stale-result' | 'recorded-current-result' | 'recorded-failed-result' }
>;

export function createCollectionValidationRunOutcome(input: {
	activeCollection?: ModCollection;
	config: AppConfig;
	modalType?: CollectionManagerModalType;
	validationResult?: CollectionWorkspaceValidationResult;
}): CollectionValidationResultRunOutcome {
	const decision = getCollectionValidationCompletionDecision(input);

	switch (decision.action) {
		case 'discard-stale-result':
			return {
				type: 'discarded-stale-result',
				validationResult: input.validationResult
			};
		case 'record-failed-result':
			return {
				type: 'recorded-failed-result',
				modalType: input.modalType,
				validationResult: decision.validationResult
			};
		case 'persist-current-draft':
			return {
				type: 'recorded-current-result',
				validationResult: decision.validationResult
			};
	}
}

import {
	type AppConfig,
	type CollectionErrors,
	CollectionManagerModalType,
	type CollectionValidationOutcome,
	createCollectionValidationResultPolicy,
	getCollectionValidationKey,
	getValidationIssueList,
	type SessionMods,
	summarizeValidationIssues,
	type ValidationIssueSummary
} from 'model';

export type { ValidationIssueSummary };
export { getCollectionValidationKey, getValidationIssueList, summarizeValidationIssues };

interface RenderValidationErrorsResult {
	errors?: CollectionErrors;
	modalType?: CollectionManagerModalType;
	outcome: CollectionValidationOutcome;
	success: boolean;
	summary: ValidationIssueSummary;
}

export function renderValidationErrors(
	_mods: SessionMods,
	errors: CollectionErrors,
	config: AppConfig,
	launchIfValid: boolean
): RenderValidationErrorsResult {
	const validationResult = createCollectionValidationResultPolicy(errors, config);
	const modalType =
		launchIfValid && !validationResult.success
			? validationResult.outcome === 'blocked'
				? CollectionManagerModalType.ERRORS_FOUND
				: CollectionManagerModalType.WARNINGS_FOUND
			: undefined;

	return {
		errors: validationResult.errors,
		modalType,
		outcome: validationResult.outcome,
		success: validationResult.success,
		summary: validationResult.summary
	};
}

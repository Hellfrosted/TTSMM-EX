import {
	CollectionManagerModalType,
	createCollectionValidationResultPolicy,
	getCollectionValidationKey,
	getValidationIssueList,
	summarizeValidationIssues,
	type AppConfig,
	type CollectionErrors,
	type SessionMods,
	type ValidationIssueSummary
} from 'model';

export { getCollectionValidationKey, getValidationIssueList, summarizeValidationIssues };
export type { ValidationIssueSummary };

interface RenderValidationErrorsResult {
	errors?: CollectionErrors;
	modalType?: CollectionManagerModalType;
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
		success: validationResult.success,
		summary: validationResult.summary
	};
}

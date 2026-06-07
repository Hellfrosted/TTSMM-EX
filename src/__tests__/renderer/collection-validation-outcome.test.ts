import { describe, expect, it } from 'vitest';
import { CollectionManagerModalType, type ModCollection } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { createCollectionValidationRunOutcome } from '../../renderer/collection-validation-outcome';
import {
	type CollectionWorkspaceValidationResult,
	createCollectionWorkspaceValidationResult
} from '../../renderer/collection-workspace-session';

const summary = {
	affectedMods: 0,
	missingDependencies: 0,
	incompatibleMods: 0,
	invalidIds: 0,
	subscriptionIssues: 0,
	installIssues: 0,
	updateIssues: 0
};

function collection(mods: string[]): ModCollection {
	return {
		name: 'default',
		mods
	};
}

function validationResult(collection: ModCollection, success: boolean): CollectionWorkspaceValidationResult {
	const result = createCollectionWorkspaceValidationResult({
		collection,
		config: DEFAULT_CONFIG,
		success,
		summary
	});

	if (!result) {
		throw new Error('Expected validation result');
	}

	return result;
}

describe('collection validation outcome', () => {
	it('maps fresh validation results to recorded outcomes', () => {
		const draft = collection(['local:a']);
		const passed = validationResult(draft, true);
		const failed = validationResult(draft, false);

		expect(
			createCollectionValidationRunOutcome({
				activeCollection: draft,
				config: DEFAULT_CONFIG,
				validationResult: passed
			})
		).toEqual({
			type: 'recorded-current-result',
			validationResult: passed
		});
		expect(
			createCollectionValidationRunOutcome({
				activeCollection: draft,
				config: DEFAULT_CONFIG,
				modalType: CollectionManagerModalType.ERRORS_FOUND,
				validationResult: failed
			})
		).toEqual({
			type: 'recorded-failed-result',
			modalType: CollectionManagerModalType.ERRORS_FOUND,
			validationResult: failed
		});
	});

	it('discards stale validation results', () => {
		const staleResult = validationResult(collection(['local:a']), true);

		expect(
			createCollectionValidationRunOutcome({
				activeCollection: collection(['local:b']),
				config: DEFAULT_CONFIG,
				validationResult: staleResult
			})
		).toEqual({
			type: 'discarded-stale-result',
			validationResult: staleResult
		});
	});
});

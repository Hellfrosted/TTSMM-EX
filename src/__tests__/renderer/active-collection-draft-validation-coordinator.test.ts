import { describe, expect, it, vi } from 'vitest';
import { CollectionManagerModalType, type ModCollection } from '../../model';
import { createActiveCollectionDraftValidationCoordinator } from '../../renderer/active-collection-draft-validation-coordinator';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	type CollectionValidationRunOutcome,
	type CollectionWorkspaceValidationResult,
	type CollectionWorkspaceWorkflowEvent,
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

function validationResult(collection: ModCollection, success = true): CollectionWorkspaceValidationResult {
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

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('active-collection-draft-validation-coordinator', () => {
	it('routes only the latest validation outcome when requests complete out of order', async () => {
		const firstDraft = collection(['local:a']);
		const secondDraft = collection(['local:a', 'local:b']);
		const completions: Array<(outcome: CollectionValidationRunOutcome) => void> = [];
		const events: CollectionWorkspaceWorkflowEvent[] = [];
		const coordinator = createActiveCollectionDraftValidationCoordinator({
			applyWorkflowEvent: (event) => {
				events.push(event);
			},
			cancelValidation: vi.fn(),
			validateDraft: vi.fn(
				() =>
					new Promise<CollectionValidationRunOutcome>((resolve) => {
						completions.push(resolve);
					})
			)
		});

		coordinator.validate(firstDraft, false);
		coordinator.validate(secondDraft, true);
		completions[0]?.({
			type: 'recorded-current-result',
			validationResult: validationResult(firstDraft)
		});
		await flushPromises();

		expect(events).toEqual([
			{ type: 'validation-started', launchIfValid: false },
			{ type: 'validation-started', launchIfValid: true }
		]);

		const secondResult = validationResult(secondDraft);
		completions[1]?.({
			type: 'recorded-current-result',
			validationResult: secondResult
		});
		await flushPromises();

		expect(events).toEqual([
			{ type: 'validation-started', launchIfValid: false },
			{ type: 'validation-started', launchIfValid: true },
			{ type: 'validation-completed', result: secondResult }
		]);
	});

	it('invalidates a pending validation when cancellation is requested', async () => {
		const draft = collection(['local:a']);
		let completeValidation: ((outcome: CollectionValidationRunOutcome) => void) | undefined;
		const events: CollectionWorkspaceWorkflowEvent[] = [];
		const cancelValidation = vi.fn();
		const coordinator = createActiveCollectionDraftValidationCoordinator({
			applyWorkflowEvent: (event) => {
				events.push(event);
			},
			cancelValidation,
			validateDraft: vi.fn(
				() =>
					new Promise<CollectionValidationRunOutcome>((resolve) => {
						completeValidation = resolve;
					})
			)
		});

		coordinator.validate(draft, false);
		coordinator.cancel();
		completeValidation?.({
			type: 'recorded-current-result',
			validationResult: validationResult(draft)
		});
		await flushPromises();

		expect(cancelValidation).toHaveBeenCalledOnce();
		expect(events).toEqual([{ type: 'validation-started', launchIfValid: false }]);
	});

	it('routes failed validation outcomes through workflow events', async () => {
		const draft = collection(['local:a']);
		const events: CollectionWorkspaceWorkflowEvent[] = [];
		const coordinator = createActiveCollectionDraftValidationCoordinator({
			applyWorkflowEvent: (event) => {
				events.push(event);
			},
			cancelValidation: vi.fn(),
			validateDraft: vi.fn(
				async (): Promise<CollectionValidationRunOutcome> => ({
					type: 'recorded-failed-result',
					modalType: CollectionManagerModalType.ERRORS_FOUND,
					validationResult: validationResult(draft, false)
				})
			)
		});

		coordinator.validate(draft, true);
		await flushPromises();

		expect(events).toEqual([
			{ type: 'validation-started', launchIfValid: true },
			{
				type: 'validation-completed',
				result: validationResult(draft, false),
				modalType: CollectionManagerModalType.ERRORS_FOUND
			}
		]);
	});
});

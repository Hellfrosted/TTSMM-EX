import { describe, expect, it } from 'vitest';
import type { ModCollection } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	type CollectionWorkspaceValidationResult,
	createCollectionWorkspaceValidationResult
} from '../../renderer/collection-workspace-session';
import {
	type ActiveCollectionDraftRuntimeFacts,
	createCollectionWorkspaceWorkflowState,
	reduceCollectionWorkspaceWorkflow
} from '../../renderer/collection-workspace-workflow';

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

function validationResult(collection: ModCollection): CollectionWorkspaceValidationResult {
	const result = createCollectionWorkspaceValidationResult({
		collection,
		config: DEFAULT_CONFIG,
		success: true,
		summary
	});

	if (!result) {
		throw new Error('Expected validation result');
	}

	return result;
}

describe('collection workspace runtime facts', () => {
	it('blocks launch requests from lifecycle-owned loading facts', () => {
		const draft = collection(['local:a']);
		const state = createCollectionWorkspaceWorkflowState({
			config: DEFAULT_CONFIG,
			draft,
			runtimeFacts: {
				gameRunning: false,
				launchingGame: false,
				loadingMods: true,
				savingDraft: false
			},
			validationResult: validationResult(draft)
		});

		const transition = reduceCollectionWorkspaceWorkflow(state, {
			type: 'launch-requested'
		});

		expect(transition.state).toBe(state);
		expect(transition.effects).toEqual([]);
	});

	it('updates launch readiness from runtime fact events', () => {
		const draft = collection(['local:a']);
		const nextFacts: ActiveCollectionDraftRuntimeFacts = {
			gameRunning: true,
			launchingGame: false,
			loadingMods: false,
			savingDraft: false
		};

		const transition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({
				config: DEFAULT_CONFIG,
				draft,
				validationResult: validationResult(draft)
			}),
			{
				type: 'runtime-facts-changed',
				facts: nextFacts
			}
		);

		expect(transition.state.runtimeFacts).toEqual(nextFacts);
		expect(transition.effects).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import { type CollectionErrors, CollectionManagerModalType, type ModCollection, ModErrorType } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	applyCollectionContentSaveResult,
	type CollectionWorkspaceValidationResult,
	createCollectionDraftEditWorkflow,
	createCollectionWorkspaceSession,
	createCollectionWorkspaceValidationResult,
	createCollectionWorkspaceWorkflowState,
	getCollectionDraftEditWorkflowDecision,
	getCollectionLaunchCommandState,
	getCollectionLaunchRequestDecision,
	getCollectionLaunchWorkflowDecision,
	getCollectionLifecycleDirtyDraft,
	getCollectionValidationCompletionDecision,
	getCollectionValidationPersistenceDecision,
	getCollectionValidationRunCompletionEffects,
	getLoadedModsValidationDecision,
	getPendingDraftValidationDecision,
	type LaunchReadinessBlocker,
	reduceCollectionWorkspaceWorkflow,
	setCollectionDraftEnabledMods,
	setCollectionDraftModSubset,
	shouldValidatePendingCollectionDraft,
	toggleCollectionDraftMod
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

describe('collection-workspace-session', () => {
	it('tracks an Active Collection Draft without mutating the source collection', () => {
		const activeCollection = collection(['local:a']);

		const session = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: true
		});

		expect(session.draft).toEqual(activeCollection);
		expect(session.draft).not.toBe(activeCollection);
		expect(session.hasUnsavedDraft).toBe(true);
		expect(session.savingDraft).toBe(false);
		expect(session.validatingDraft).toBe(false);
		expect(session.validationStatus).toBe('none');
	});

	it('attaches validation results to the draft key and marks changed drafts stale', () => {
		const validatedCollection = collection(['local:a']);
		const currentDraft = collection(['local:a', 'local:b']);

		const session = createCollectionWorkspaceSession({
			activeCollection: currentDraft,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: true,
			validationResult: validationResult(validatedCollection)
		});

		expect(session.validationStatus).toBe('stale');
		expect(session.currentValidationStatus).toBeUndefined();
		expect(session.currentCollectionErrors).toBeUndefined();
		expect(session.launchReadiness).toEqual({
			ready: false,
			blockers: ['validation-stale']
		});
	});

	it('allows launch only for a fresh successful validation while the workspace is idle', () => {
		const activeCollection = collection(['local:a']);

		const session = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			validationResult: validationResult(activeCollection)
		});

		expect(session.validationStatus).toBe('passed');
		expect(session.currentValidationStatus).toBe(true);
		expect(session.launchReadiness).toEqual({
			ready: true,
			blockers: []
		});
	});

	it('blocks launch for failed validation', () => {
		const activeCollection = collection(['local:a']);
		const errors: CollectionErrors = {
			'local:a': {
				type: ModErrorType.INVALID_ID,
				invalidId: true
			}
		};
		const result = {
			...validationResult(activeCollection, false),
			errors
		};

		const session = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			validationResult: result
		});

		expect(session.validationStatus).toBe('failed');
		expect(session.currentValidationStatus).toBe(false);
		expect(session.currentCollectionErrors).toBe(errors);
		expect(session.launchReadiness).toEqual({
			ready: false,
			blockers: ['validation-failed']
		});
	});

	it.each<[LaunchReadinessBlocker, Partial<Parameters<typeof createCollectionWorkspaceSession>[0]>]>([
		['loading-mods', { loadingMods: true }],
		['saving-draft', { savingDraft: true }],
		['validating-draft', { validatingDraft: true }],
		['launching-game', { launchingGame: true }],
		['game-running', { gameRunning: true }]
	])('blocks launch while %s is active', (blocker, input) => {
		const activeCollection = collection(['local:a']);

		const session = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			validationResult: validationResult(activeCollection),
			...input
		});

		expect(session.launchReadiness.ready).toBe(false);
		expect(session.launchReadiness.blockers).toContain(blocker);
		if (blocker === 'saving-draft') {
			expect(session.savingDraft).toBe(true);
		}
		if (blocker === 'validating-draft') {
			expect(session.validatingDraft).toBe(true);
		}
	});

	it('keeps launch command available when launch can validate the current draft first', () => {
		const activeCollection = collection(['local:a']);
		const missingValidationSession = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false
		});
		const staleValidationSession = createCollectionWorkspaceSession({
			activeCollection: collection(['local:a', 'local:b']),
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: true,
			validationResult: validationResult(activeCollection)
		});

		expect(getCollectionLaunchCommandState({ launchReadiness: missingValidationSession.launchReadiness })).toEqual({
			disabled: false
		});
		expect(getCollectionLaunchCommandState({ launchReadiness: staleValidationSession.launchReadiness })).toEqual({
			disabled: false
		});
	});

	it('blocks launch commands while non-validation blockers are active', () => {
		const activeCollection = collection(['local:a']);
		const session = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			launchingGame: true,
			validationResult: validationResult(activeCollection)
		});

		expect(getCollectionLaunchCommandState({ launchReadiness: session.launchReadiness })).toEqual({
			disabled: true,
			reason: 'Already launching game'
		});
		expect(getCollectionLaunchCommandState({ launchReadiness: session.launchReadiness, modalOpen: true })).toEqual({
			disabled: true
		});
	});

	it('toggles draft mods without mutating the source collection', () => {
		const activeCollection = collection(['local:a']);

		const result = toggleCollectionDraftMod({
			checked: true,
			collection: activeCollection,
			modManagerUid: 'workshop:1',
			uid: 'local:b'
		});

		expect(result.blockedModManagerDeselect).toBe(false);
		expect(result.nextDraft).toEqual({ name: 'default', mods: ['local:a', 'local:b'] });
		expect(result.nextDraft).not.toBe(activeCollection);
		expect(activeCollection.mods).toEqual(['local:a']);
	});

	it('creates a workflow outcome that applies an edited draft and schedules validation after application', () => {
		const activeCollection = collection(['local:a']);
		const editResult = toggleCollectionDraftMod({
			checked: true,
			collection: activeCollection,
			modManagerUid: 'workshop:1',
			uid: 'local:b'
		});

		const workflow = createCollectionDraftEditWorkflow(editResult);

		expect(workflow).toEqual({
			blockedModManagerDeselect: false,
			nextDraft: { name: 'default', mods: ['local:a', 'local:b'] },
			pendingValidationDraft: { name: 'default', mods: ['local:a', 'local:b'] },
			shouldMarkUnsavedDraft: true
		});
		expect(workflow.nextDraft).not.toBe(editResult.nextDraft);
		expect(workflow.pendingValidationDraft).not.toBe(workflow.nextDraft);
		expect(
			shouldValidatePendingCollectionDraft({
				currentDraft: workflow.nextDraft,
				pendingDraft: workflow.pendingValidationDraft
			})
		).toBe(true);
	});

	it('decides draft edit workflow side effects without performing them', () => {
		const activeCollection = collection(['workshop:1']);
		const editedWorkflow = createCollectionDraftEditWorkflow(
			toggleCollectionDraftMod({
				checked: true,
				collection: activeCollection,
				modManagerUid: 'workshop:1',
				uid: 'local:b'
			})
		);
		const blockedWorkflow = createCollectionDraftEditWorkflow(
			toggleCollectionDraftMod({
				checked: false,
				collection: activeCollection,
				modManagerUid: 'workshop:1',
				uid: 'workshop:1'
			})
		);

		expect(getCollectionDraftEditWorkflowDecision(editedWorkflow)).toEqual({
			pendingValidationDraft: { name: 'default', mods: ['workshop:1', 'local:b'] },
			shouldCancelValidation: true,
			shouldOpenBlockedModManagerDeselectDialog: false
		});
		expect(getCollectionDraftEditWorkflowDecision(blockedWorkflow)).toEqual({
			shouldCancelValidation: false,
			shouldOpenBlockedModManagerDeselectDialog: true
		});
	});

	it('reduces draft edit workflow events into pending validation effects', () => {
		const activeCollection = collection(['workshop:1']);
		const workflow = createCollectionDraftEditWorkflow(
			toggleCollectionDraftMod({
				checked: true,
				collection: activeCollection,
				modManagerUid: 'workshop:1',
				uid: 'local:b'
			})
		);

		const editTransition = reduceCollectionWorkspaceWorkflow(createCollectionWorkspaceWorkflowState(), {
			type: 'draft-edit-workflow-created',
			workflow
		});

		expect(editTransition.state).toEqual({
			hasUnsavedDraft: true,
			hasValidatedLoadedMods: false,
			pendingValidationDraft: { name: 'default', mods: ['workshop:1', 'local:b'] }
		});
		expect(editTransition.effects).toEqual([{ type: 'cancel-validation' }]);

		const validationTransition = reduceCollectionWorkspaceWorkflow(editTransition.state, {
			type: 'active-draft-changed',
			currentDraft: workflow.nextDraft
		});

		expect(validationTransition.state.pendingValidationDraft).toBeUndefined();
		expect(validationTransition.effects).toEqual([{ type: 'validate-active-collection', launchIfValid: false }]);
	});

	it('reduces loaded-mod changes into recalculate and validation effects', () => {
		const loadingTransition = reduceCollectionWorkspaceWorkflow(createCollectionWorkspaceWorkflowState({ hasValidatedLoadedMods: true }), {
			type: 'loaded-mods-changed',
			loadingMods: true
		});

		expect(loadingTransition.state.hasValidatedLoadedMods).toBe(false);
		expect(loadingTransition.effects).toEqual([]);

		const loadedTransition = reduceCollectionWorkspaceWorkflow(loadingTransition.state, {
			type: 'loaded-mods-changed',
			loadingMods: false
		});

		expect(loadedTransition.state.hasValidatedLoadedMods).toBe(true);
		expect(loadedTransition.effects).toEqual([
			{ type: 'recalculate-mod-data' },
			{ type: 'validate-active-collection', launchIfValid: false }
		]);
	});

	it('reduces metadata updates into recalculate and idle validation effects', () => {
		const loadingTransition = reduceCollectionWorkspaceWorkflow(createCollectionWorkspaceWorkflowState(), {
			type: 'mod-metadata-updated',
			loadingMods: true
		});
		const idleTransition = reduceCollectionWorkspaceWorkflow(createCollectionWorkspaceWorkflowState(), {
			type: 'mod-metadata-updated',
			loadingMods: false
		});

		expect(loadingTransition.effects).toEqual([{ type: 'recalculate-mod-data' }]);
		expect(idleTransition.effects).toEqual([
			{ type: 'recalculate-mod-data' },
			{ type: 'validate-active-collection', launchIfValid: false }
		]);
	});

	it('creates a workflow outcome without draft side effects when a draft edit is unchanged', () => {
		const workflow = createCollectionDraftEditWorkflow(
			toggleCollectionDraftMod({
				checked: true,
				collection: collection(['local:a']),
				modManagerUid: 'workshop:1',
				uid: 'local:a'
			})
		);

		expect(workflow).toEqual({
			blockedModManagerDeselect: false,
			shouldMarkUnsavedDraft: false
		});
	});

	it('blocks draft edits that deselect Mod Manager', () => {
		const result = toggleCollectionDraftMod({
			checked: false,
			collection: collection(['workshop:1']),
			modManagerUid: 'workshop:1',
			uid: 'workshop:1'
		});

		expect(result).toEqual({
			blockedModManagerDeselect: true
		});
	});

	it('decides when pending draft validation should run', () => {
		const pendingDraft = collection(['local:a', 'local:b']);

		expect(getPendingDraftValidationDecision({ currentDraft: collection(['local:a']), pendingDraft })).toEqual({
			shouldValidateActiveCollection: false
		});
		expect(getPendingDraftValidationDecision({ currentDraft: collection(['local:a', 'local:b']), pendingDraft })).toEqual({
			shouldValidateActiveCollection: true
		});
	});

	it('decides the loaded-mod validation workflow', () => {
		expect(getLoadedModsValidationDecision({ hasValidatedLoadedMods: true, loadingMods: true })).toEqual({
			nextHasValidatedLoadedMods: false,
			shouldRecalculateModData: false,
			shouldValidateActiveCollection: false
		});
		expect(getLoadedModsValidationDecision({ hasValidatedLoadedMods: false, loadingMods: false })).toEqual({
			nextHasValidatedLoadedMods: true,
			shouldRecalculateModData: true,
			shouldValidateActiveCollection: true
		});
		expect(getLoadedModsValidationDecision({ hasValidatedLoadedMods: true, loadingMods: false })).toEqual({
			nextHasValidatedLoadedMods: true,
			shouldRecalculateModData: true,
			shouldValidateActiveCollection: false
		});
	});

	it('decides launch workflow from Launch Readiness', () => {
		const activeCollection = collection(['local:a']);
		const readySession = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			validationResult: validationResult(activeCollection)
		});
		const missingValidationSession = createCollectionWorkspaceSession({
			activeCollection,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false
		});

		expect(
			getCollectionLaunchWorkflowDecision({
				hasActiveCollection: true,
				launchReadiness: readySession.launchReadiness
			}).action
		).toBe('launch-current-draft');
		expect(
			getCollectionLaunchWorkflowDecision({
				hasActiveCollection: true,
				launchReadiness: missingValidationSession.launchReadiness
			}).action
		).toBe('validate-current-draft');
		expect(
			getCollectionLaunchWorkflowDecision({
				hasActiveCollection: true,
				launchReadiness: readySession.launchReadiness,
				modalOpen: true
			})
		).toEqual({
			action: 'none',
			commandState: { disabled: true }
		});
		expect(
			getCollectionLaunchRequestDecision({
				activeCollection,
				launchReadiness: readySession.launchReadiness
			})
		).toEqual({
			action: 'launch-current-draft',
			commandState: { disabled: false },
			launchCollection: activeCollection
		});
	});

	it('decides validation completion actions from draft freshness and success', () => {
		const activeCollection = collection(['local:a']);
		const successfulResult = validationResult(activeCollection);
		const failedResult = validationResult(activeCollection, false);
		const staleResult = validationResult(collection(['local:b']));

		expect(
			getCollectionValidationCompletionDecision({
				activeCollection,
				config: DEFAULT_CONFIG,
				validationResult: successfulResult
			})
		).toEqual({
			action: 'persist-current-draft',
			validationResult: successfulResult
		});
		expect(
			getCollectionValidationCompletionDecision({
				activeCollection,
				config: DEFAULT_CONFIG,
				validationResult: failedResult
			})
		).toEqual({
			action: 'record-failed-result',
			validationResult: failedResult
		});
		expect(
			getCollectionValidationCompletionDecision({
				activeCollection,
				config: DEFAULT_CONFIG,
				validationResult: staleResult
			})
		).toEqual({
			action: 'discard-stale-result'
		});
	});

	it('decides post-persistence validation recording and launch actions', () => {
		const activeCollection = collection(['local:a']);
		const successfulResult = validationResult(activeCollection);
		const staleResult = validationResult(collection(['local:b']));

		expect(
			getCollectionValidationPersistenceDecision({
				activeCollection,
				config: DEFAULT_CONFIG,
				launchIfValid: false,
				validationResult: successfulResult
			})
		).toEqual({
			action: 'record-current-result'
		});
		expect(
			getCollectionValidationPersistenceDecision({
				activeCollection,
				config: DEFAULT_CONFIG,
				launchIfValid: true,
				validationResult: successfulResult
			})
		).toEqual({
			action: 'record-and-launch-current-draft',
			launchCollection: activeCollection
		});
		expect(
			getCollectionValidationPersistenceDecision({
				activeCollection,
				config: DEFAULT_CONFIG,
				launchIfValid: true,
				validationResult: staleResult
			})
		).toEqual({
			action: 'discard-stale-result'
		});
	});

	it('plans validation run completion effects for stale results, failures, persistence, and launch continuation', () => {
		const activeCollection = collection(['local:a']);
		const successfulResult = validationResult(activeCollection);

		expect(getCollectionValidationRunCompletionEffects({ type: 'missing-active-collection' }, true)).toEqual([
			{ type: 'launch-empty-mod-list' }
		]);
		expect(
			getCollectionValidationRunCompletionEffects(
				{
					type: 'recorded-and-ready-to-launch-current-draft',
					launchCollection: activeCollection,
					validationResult: successfulResult
				},
				true
			)
		).toEqual([{ type: 'launch-current-draft', launchCollection: activeCollection }]);
		expect(
			getCollectionValidationRunCompletionEffects(
				{
					type: 'recorded-failed-result',
					modalType: CollectionManagerModalType.ERRORS_FOUND,
					validationResult: validationResult(activeCollection, false)
				},
				true
			)
		).toEqual([{ type: 'open-validation-modal', modalType: CollectionManagerModalType.ERRORS_FOUND }]);
		expect(
			getCollectionValidationRunCompletionEffects({ type: 'discarded-stale-result', validationResult: successfulResult }, true)
		).toEqual([{ type: 'clear-launching-game' }]);
		expect(
			getCollectionValidationRunCompletionEffects({ type: 'recorded-current-result', validationResult: successfulResult }, false)
		).toEqual([]);
	});

	it('sets enabled draft mods while forcing Mod Manager to stay enabled', () => {
		const activeCollection = collection(['workshop:1']);
		const enabledMods = new Set(['local:b']);

		const result = setCollectionDraftEnabledMods({
			collection: activeCollection,
			enabledMods,
			modManagerUid: 'workshop:1'
		});

		expect(result.nextDraft).toEqual({ name: 'default', mods: ['local:b', 'workshop:1'] });
		expect([...enabledMods]).toEqual(['local:b']);
	});

	it('applies draft mod subsets and reports blocked Mod Manager deselection', () => {
		const result = setCollectionDraftModSubset({
			collection: collection(['local:a', 'workshop:1']),
			changes: {
				'local:a': false,
				'local:b': true,
				'workshop:1': false
			},
			modManagerUid: 'workshop:1'
		});

		expect(result.blockedModManagerDeselect).toBe(true);
		expect(result.nextDraft).toEqual({ name: 'default', mods: ['local:b', 'workshop:1'] });
	});

	it('validates a pending draft only after the current draft matches it', () => {
		const pendingDraft = collection(['local:a', 'local:b']);

		expect(
			shouldValidatePendingCollectionDraft({
				currentDraft: collection(['local:a', 'local:b']),
				pendingDraft
			})
		).toBe(true);
		expect(
			shouldValidatePendingCollectionDraft({
				currentDraft: collection(['local:b', 'local:a']),
				pendingDraft
			})
		).toBe(false);
		expect(
			shouldValidatePendingCollectionDraft({
				currentDraft: { name: 'other', mods: ['local:a', 'local:b'] },
				pendingDraft
			})
		).toBe(false);
	});

	it('clears unsaved draft state only after accepted pure content saves', () => {
		expect(
			applyCollectionContentSaveResult({
				hasUnsavedDraft: true,
				pureSave: true,
				writeAccepted: true
			})
		).toEqual({ hasUnsavedDraft: false });
		expect(
			applyCollectionContentSaveResult({
				hasUnsavedDraft: true,
				pureSave: true,
				writeAccepted: false
			})
		).toEqual({ hasUnsavedDraft: true });
		expect(
			applyCollectionContentSaveResult({
				hasUnsavedDraft: true,
				pureSave: false,
				writeAccepted: true
			})
		).toEqual({ hasUnsavedDraft: true });
	});

	it('creates lifecycle dirty draft payloads only when the draft is unsaved', () => {
		const draft = collection(['local:a']);

		const dirtyDraft = getCollectionLifecycleDirtyDraft({
			draft,
			hasUnsavedDraft: true
		});

		expect(dirtyDraft).toEqual(draft);
		expect(dirtyDraft).not.toBe(draft);
		expect(getCollectionLifecycleDirtyDraft({ draft, hasUnsavedDraft: false })).toBeUndefined();
		expect(getCollectionLifecycleDirtyDraft({ draft: undefined, hasUnsavedDraft: true })).toBeUndefined();
	});
});

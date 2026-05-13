import { describe, expect, it } from 'vitest';
import { type CollectionErrors, CollectionManagerModalType, type ModCollection, ModErrorType } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	applyCollectionContentSaveResult,
	type CollectionWorkspaceValidationResult,
	createCollectionWorkspaceSession,
	createCollectionWorkspaceValidationResult,
	createCollectionWorkspaceWorkflowState,
	getCollectionLaunchCommandState,
	getCollectionLaunchRequestDecision,
	getCollectionLaunchWorkflowDecision,
	getCollectionLifecycleDirtyDraft,
	getCollectionValidationCompletionDecision,
	getCollectionValidationPersistenceDecision,
	getLoadedModsValidationDecision,
	type LaunchReadinessBlocker,
	reduceCollectionWorkspaceWorkflow,
	setCollectionDraftEnabledMods,
	setCollectionDraftModSubset,
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

	it('reduces Active Collection Draft edit events into validation effects', () => {
		const activeCollection = collection(['workshop:1']);
		const edit = toggleCollectionDraftMod({
			checked: true,
			collection: activeCollection,
			modManagerUid: 'workshop:1',
			uid: 'local:b'
		});

		const editTransition = reduceCollectionWorkspaceWorkflow(createCollectionWorkspaceWorkflowState(), {
			type: 'active-draft-edited',
			edit
		});

		expect(editTransition.state).toMatchObject({
			draft: { name: 'default', mods: ['workshop:1', 'local:b'] },
			hasUnsavedDraft: true,
			hasValidatedLoadedMods: false
		});
		expect(editTransition.effects).toEqual([{ type: 'cancel-validation' }, { type: 'validate-active-collection', launchIfValid: false }]);
	});

	it('reduces unchanged Active Collection Draft edits without validation effects', () => {
		const activeCollection = collection(['local:a']);
		const edit = toggleCollectionDraftMod({
			checked: true,
			collection: activeCollection,
			modManagerUid: 'workshop:1',
			uid: 'local:a'
		});

		const initialState = createCollectionWorkspaceWorkflowState({ draft: activeCollection });
		const transition = reduceCollectionWorkspaceWorkflow(initialState, {
			type: 'active-draft-edited',
			edit
		});

		expect(transition.state).toBe(initialState);
		expect(transition.effects).toEqual([]);
	});

	it('reduces blocked Mod Manager deselection without cancelling or validating', () => {
		const activeCollection = collection(['workshop:1']);
		const edit = toggleCollectionDraftMod({
			checked: false,
			collection: activeCollection,
			modManagerUid: 'workshop:1',
			uid: 'workshop:1'
		});

		const transition = reduceCollectionWorkspaceWorkflow(createCollectionWorkspaceWorkflowState({ draft: activeCollection }), {
			type: 'active-draft-edited',
			edit
		});

		expect(transition.effects).toEqual([{ type: 'open-blocked-mod-manager-deselect-dialog' }]);
		expect(transition.state.hasUnsavedDraft).toBe(false);
		expect(transition.state.draft).toEqual(activeCollection);
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
			shouldRecalculateModData: false,
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

	it('reduces launch requests into validation, modal, or save-before-launch effects', () => {
		const draft = collection(['local:a']);
		const readySession = createCollectionWorkspaceSession({
			activeCollection: draft,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			validationResult: validationResult(draft)
		});
		const missingValidationSession = createCollectionWorkspaceSession({
			activeCollection: draft,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false
		});
		const failedValidationSession = createCollectionWorkspaceSession({
			activeCollection: draft,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: false,
			validationResult: validationResult(draft, false)
		});

		const readyTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({
				config: DEFAULT_CONFIG,
				draft,
				validationResult: validationResult(draft)
			}),
			{
				type: 'launch-requested',
				launchReadiness: readySession.launchReadiness
			}
		);
		expect(readyTransition.state.pendingLaunchAfterSaveDraftKey).toBe(validationResult(draft).draftKey);
		expect(readyTransition.effects).toEqual([
			{ type: 'set-launching-game', launchingGame: true },
			{ type: 'persist-active-collection-draft' }
		]);

		const validateTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({ config: DEFAULT_CONFIG, draft }),
			{
				type: 'launch-requested',
				launchReadiness: missingValidationSession.launchReadiness
			}
		);
		expect(validateTransition.effects).toEqual([
			{ type: 'set-launching-game', launchingGame: true },
			{ type: 'clear-collection-errors' },
			{ type: 'validate-active-collection', launchIfValid: true }
		]);

		const failedTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({ config: DEFAULT_CONFIG, draft, validationResult: validationResult(draft, false) }),
			{
				type: 'launch-requested',
				launchReadiness: failedValidationSession.launchReadiness
			}
		);
		expect(failedTransition.effects).toEqual([{ type: 'open-validation-modal', modalType: CollectionManagerModalType.ERRORS_FOUND }]);
	});

	it('launches anyway only past validation blockers and still saves dirty drafts first', () => {
		const draft = collection(['local:a']);
		const failedValidationSession = createCollectionWorkspaceSession({
			activeCollection: draft,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: true,
			validationResult: validationResult(draft, false)
		});
		const loadingSession = createCollectionWorkspaceSession({
			activeCollection: draft,
			config: DEFAULT_CONFIG,
			hasUnsavedDraft: true,
			loadingMods: true,
			validationResult: validationResult(draft, false)
		});

		const dirtyAnywayTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({
				config: DEFAULT_CONFIG,
				draft,
				hasUnsavedDraft: true,
				validationResult: validationResult(draft, false)
			}),
			{
				type: 'launch-anyway-requested',
				launchReadiness: failedValidationSession.launchReadiness,
				modalOpen: true
			}
		);
		expect(dirtyAnywayTransition.state.pendingLaunchAfterSaveDraftKey).toBe(validationResult(draft).draftKey);
		expect(dirtyAnywayTransition.effects).toEqual([
			{ type: 'set-launching-game', launchingGame: true },
			{ type: 'persist-active-collection-draft' }
		]);

		const cleanAnywayTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({ config: DEFAULT_CONFIG, draft, validationResult: validationResult(draft, false) }),
			{
				type: 'launch-anyway-requested',
				launchReadiness: failedValidationSession.launchReadiness
			}
		);
		expect(cleanAnywayTransition.effects).toEqual([{ type: 'set-launching-game', launchingGame: true }, { type: 'launch-current-draft' }]);

		const blockedTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({
				config: DEFAULT_CONFIG,
				draft,
				hasUnsavedDraft: true,
				validationResult: validationResult(draft, false)
			}),
			{
				type: 'launch-anyway-requested',
				launchReadiness: loadingSession.launchReadiness
			}
		);
		expect(blockedTransition.effects).toEqual([{ type: 'clear-launching-game' }]);
		expect(blockedTransition.state.pendingLaunchAfterSaveDraftKey).toBeUndefined();
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

	it('opens the validation modal from the workflow after launch-triggered validation fails', () => {
		const activeCollection = collection(['local:a']);
		const failedResult = validationResult(activeCollection, false);
		const validatingTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({ config: DEFAULT_CONFIG, draft: activeCollection }),
			{
				type: 'validation-started',
				launchIfValid: true
			}
		);

		const failedTransition = reduceCollectionWorkspaceWorkflow(validatingTransition.state, {
			type: 'validation-completed',
			result: failedResult,
			modalType: CollectionManagerModalType.ERRORS_FOUND
		});

		expect(failedTransition.effects).toEqual([
			{ type: 'open-validation-modal', modalType: CollectionManagerModalType.ERRORS_FOUND },
			{ type: 'clear-launching-game' }
		]);
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

	it('clears unsaved draft state after accepted content saves', () => {
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
		).toEqual({ hasUnsavedDraft: false });
	});

	it('requests save before launch and launches only after the saved draft is accepted', () => {
		const draft = collection(['local:a']);
		const validation = validationResult(draft);
		const validatingTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({ config: DEFAULT_CONFIG, draft }),
			{
				type: 'validation-started',
				launchIfValid: true
			}
		);
		const validatedTransition = reduceCollectionWorkspaceWorkflow(validatingTransition.state, {
			type: 'validation-completed',
			result: validation
		});

		expect(validatedTransition.effects).toEqual([{ type: 'persist-active-collection-draft' }]);
		expect(validatedTransition.state.pendingLaunchAfterSaveDraftKey).toBe(validation.draftKey);

		const savedTransition = reduceCollectionWorkspaceWorkflow(validatedTransition.state, {
			type: 'collection-content-save-completed',
			pureSave: true,
			savedCollection: draft,
			writeAccepted: true
		});

		expect(savedTransition.effects).toEqual([{ type: 'launch-current-draft' }]);
		expect(savedTransition.state.hasUnsavedDraft).toBe(false);
		expect(savedTransition.state.pendingLaunchAfterSaveDraftKey).toBeUndefined();
	});

	it('clears launch state when save fails during launch continuation', () => {
		const draft = collection(['local:a']);
		const validation = validationResult(draft);
		const validatedTransition = reduceCollectionWorkspaceWorkflow(
			createCollectionWorkspaceWorkflowState({ config: DEFAULT_CONFIG, draft, validationLaunchIfValid: true, validatingDraft: true }),
			{
				type: 'validation-completed',
				result: validation
			}
		);
		const failedSaveTransition = reduceCollectionWorkspaceWorkflow(validatedTransition.state, {
			type: 'collection-content-save-completed',
			pureSave: true,
			writeAccepted: false
		});

		expect(failedSaveTransition.effects).toEqual([{ type: 'clear-launching-game' }]);
		expect(failedSaveTransition.state.pendingLaunchAfterSaveDraftKey).toBeUndefined();
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

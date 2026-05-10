import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import api from 'renderer/Api';
import { getCollectionModDataList } from 'renderer/collection-mod-list';
import {
	createCollectionWorkspaceSession,
	createCollectionWorkspaceWorkflowState,
	getCollectionLaunchRequestDecision,
	getCollectionValidationRunCompletionEffects,
	reduceCollectionWorkspaceWorkflow,
	type CollectionContentSaveCompletion,
	type CollectionDraftEditWorkflow,
	type CollectionValidationRunCompletionEffect,
	type CollectionValidationRunOutcome,
	type CollectionWorkspaceWorkflowEffect,
	type CollectionWorkspaceWorkflowEvent,
	type CollectionWorkspaceWorkflowState
} from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { useCollectionValidation } from './useCollectionValidation';
import { useCollections } from './useCollections';
import { useModMetadata } from './useModMetadata';
import type { NotificationType } from './useNotifications';

interface WorkflowAdapters {
	cancelValidation?: () => void;
	recalculateModData?: () => void;
	resetValidationState?: () => void;
	validateActiveCollection?: (launchIfValid: boolean, options?: { config?: CollectionWorkspaceAppState['config'] }) => Promise<unknown>;
}

interface UseCollectionWorkspaceSessionOptions {
	appState: CollectionWorkspaceAppState;
	gameRunning: boolean;
	launchMods: (mods: ModData[]) => Promise<void>;
	modalOpen: boolean;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	overrideGameRunning: boolean;
	setModalType: (modalType: CollectionManagerModalType) => void;
}

export function useCollectionWorkspaceSession({
	appState,
	gameRunning,
	launchMods,
	modalOpen,
	openNotification,
	overrideGameRunning,
	setModalType
}: UseCollectionWorkspaceSessionOptions): CollectionWorkspaceSessionView {
	const { activeCollection, config, launchingGame, loadingMods, mods, updateState } = appState;
	const workflowAdaptersRef = useRef<WorkflowAdapters>({});
	const [workflowState, setWorkflowState] = useState<CollectionWorkspaceWorkflowState>(() => createCollectionWorkspaceWorkflowState());
	const workflowStateRef = useRef(workflowState);

	const applyWorkflowEvent = useCallback(
		(event: CollectionWorkspaceWorkflowEvent, runEffect: (effect: CollectionWorkspaceWorkflowEffect) => void) => {
			const transition = reduceCollectionWorkspaceWorkflow(workflowStateRef.current, event);
			workflowStateRef.current = transition.state;
			setWorkflowState(transition.state);
			transition.effects.forEach(runEffect);
		},
		[]
	);

	const runWorkflowEffect = useCallback(
		(effect: CollectionWorkspaceWorkflowEffect) => {
			switch (effect.type) {
				case 'open-blocked-mod-manager-deselect-dialog':
					setModalType(CollectionManagerModalType.DESELECTING_MOD_MANAGER);
					break;
				case 'cancel-validation':
					workflowAdaptersRef.current.cancelValidation?.();
					break;
				case 'recalculate-mod-data':
					workflowAdaptersRef.current.recalculateModData?.();
					break;
				case 'validate-active-collection':
					void workflowAdaptersRef.current.validateActiveCollection?.(effect.launchIfValid);
					break;
			}
		},
		[setModalType]
	);

	const setHasUnsavedDraft = useCallback((hasUnsavedDraft: boolean) => {
		const nextState = {
			...workflowStateRef.current,
			hasUnsavedDraft
		};
		workflowStateRef.current = nextState;
		setWorkflowState(nextState);
	}, []);

	const applyDraftEditWorkflow = useCallback(
		(workflow: CollectionDraftEditWorkflow) => {
			applyWorkflowEvent({ type: 'draft-edit-workflow-created', workflow }, runWorkflowEffect);
		},
		[applyWorkflowEvent, runWorkflowEffect]
	);

	const onCollectionContentSaveCompleted = useCallback(
		(completion: CollectionContentSaveCompletion) => {
			applyWorkflowEvent({ type: 'collection-content-save-completed', ...completion }, runWorkflowEffect);
		},
		[applyWorkflowEvent, runWorkflowEffect]
	);

	const onCollectionLifecycleResultApplied = useCallback(() => {
		applyWorkflowEvent({ type: 'collection-lifecycle-result-applied' }, runWorkflowEffect);
	}, [applyWorkflowEvent, runWorkflowEffect]);

	const collectionDraftState = useMemo(
		() => ({
			hasUnsavedDraft: workflowState.hasUnsavedDraft,
			setHasUnsavedDraft
		}),
		[setHasUnsavedDraft, workflowState.hasUnsavedDraft]
	);

	const collections = useCollections({
		appState,
		draftState: collectionDraftState,
		openNotification,
		resetValidationState: () => workflowAdaptersRef.current.resetValidationState?.(),
		onCollectionContentSaveCompleted,
		onCollectionLifecycleResultApplied,
		onDraftEditWorkflow: applyDraftEditWorkflow
	});

	const validation = useCollectionValidation({
		appState,
		openNotification,
		persistCollection: collections.persistCollection
	});
	const { setCollectionErrors, validateActiveCollection } = validation;

	const applyValidationRunOutcome = useCallback(
		async (outcome: CollectionValidationRunOutcome, launchRequested: boolean) => {
			const runEffect = async (effect: CollectionValidationRunCompletionEffect) => {
				switch (effect.type) {
					case 'launch-empty-mod-list':
						await launchMods([]);
						break;
					case 'launch-current-draft': {
						const modDataList = getCollectionModDataList(mods, effect.launchCollection);
						await launchMods(modDataList);
						break;
					}
					case 'open-validation-modal':
						setModalType(effect.modalType);
						break;
					case 'clear-launching-game':
						updateState({ launchingGame: false });
						break;
				}
			};
			for (const effect of getCollectionValidationRunCompletionEffects(outcome, launchRequested)) {
				await runEffect(effect);
			}
		},
		[launchMods, mods, setModalType, updateState]
	);

	const validateAndApplyActiveCollection = useCallback(
		async (launchIfValid: boolean, options?: { config?: CollectionWorkspaceAppState['config'] }) => {
			const outcome = await validateActiveCollection(launchIfValid, options);
			await applyValidationRunOutcome(outcome, launchIfValid);
			return outcome;
		},
		[applyValidationRunOutcome, validateActiveCollection]
	);

	useEffect(() => {
		workflowAdaptersRef.current = {
			cancelValidation: validation.cancelValidation,
			recalculateModData: collections.recalculateModData,
			resetValidationState: validation.resetValidationState,
			validateActiveCollection: validateAndApplyActiveCollection
		};
	}, [collections.recalculateModData, validateAndApplyActiveCollection, validation.cancelValidation, validation.resetValidationState]);

	const onActiveDraftChanged = useCallback(
		(currentDraft: CollectionWorkspaceAppState['activeCollection']) => {
			applyWorkflowEvent({ type: 'active-draft-changed', currentDraft }, runWorkflowEffect);
		},
		[applyWorkflowEvent, runWorkflowEffect]
	);

	const onLoadedModsChanged = useCallback(
		(nextLoadingMods: CollectionWorkspaceAppState['loadingMods']) => {
			applyWorkflowEvent({ type: 'loaded-mods-changed', loadingMods: nextLoadingMods }, runWorkflowEffect);
		},
		[applyWorkflowEvent, runWorkflowEffect]
	);

	const onModMetadataUpdated = useCallback(() => {
		applyWorkflowEvent({ type: 'mod-metadata-updated', loadingMods }, runWorkflowEffect);
	}, [applyWorkflowEvent, loadingMods, runWorkflowEffect]);

	useEffect(() => {
		onActiveDraftChanged(activeCollection);
	}, [activeCollection, onActiveDraftChanged]);

	useEffect(() => {
		onLoadedModsChanged(loadingMods);
	}, [loadingMods, onLoadedModsChanged]);

	useModMetadata(appState, onModMetadataUpdated);

	const collectionWorkspaceSession = useMemo(
		() =>
			createCollectionWorkspaceSession({
				activeCollection,
				config,
				gameRunning: gameRunning || overrideGameRunning,
				hasUnsavedDraft: workflowState.hasUnsavedDraft,
				launchingGame,
				loadingMods,
				savingDraft: collections.savingCollection,
				validatingDraft: validation.validatingMods,
				validationResult: validation.validationResult
			}),
		[
			activeCollection,
			collections.savingCollection,
			config,
			gameRunning,
			launchingGame,
			loadingMods,
			overrideGameRunning,
			validation.validatingMods,
			validation.validationResult,
			workflowState.hasUnsavedDraft
		]
	);

	const validateCollection = useCallback(
		(options?: { config?: CollectionWorkspaceAppState['config'] }) => {
			setCollectionErrors(undefined);
			void validateAndApplyActiveCollection(false, options);
		},
		[setCollectionErrors, validateAndApplyActiveCollection]
	);

	const launchGame = useCallback(async () => {
		api.logger.info('validating and launching game');

		const launchWorkflowDecision = getCollectionLaunchRequestDecision({
			activeCollection,
			launchReadiness: collectionWorkspaceSession.launchReadiness,
			modalOpen
		});
		if (launchWorkflowDecision.action === 'none') {
			return;
		}

		if (launchWorkflowDecision.action === 'launch-current-draft' && launchWorkflowDecision.launchCollection) {
			const modDataList = getCollectionModDataList(mods, launchWorkflowDecision.launchCollection);
			await launchMods(modDataList);
			return;
		}

		updateState({ launchingGame: true });
		setCollectionErrors(undefined);
		await validateAndApplyActiveCollection(true);
	}, [
		activeCollection,
		collectionWorkspaceSession.launchReadiness,
		launchMods,
		modalOpen,
		mods,
		setCollectionErrors,
		updateState,
		validateAndApplyActiveCollection
	]);

	return {
		collections,
		collectionWorkspaceSession,
		currentCollectionErrors: collectionWorkspaceSession.currentCollectionErrors,
		currentValidationStatus: collectionWorkspaceSession.currentValidationStatus,
		launchGame,
		validateCollection,
		validation
	};
}

type CollectionWorkspaceSessionView = {
	collections: ReturnType<typeof useCollections>;
	collectionWorkspaceSession: ReturnType<typeof createCollectionWorkspaceSession>;
	currentCollectionErrors: ReturnType<typeof useCollectionValidation>['collectionErrors'];
	currentValidationStatus: ReturnType<typeof useCollectionValidation>['lastValidationStatus'];
	launchGame: () => Promise<void>;
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
	validation: ReturnType<typeof useCollectionValidation>;
};

import { useAtomRef } from '@effect/atom-react';
import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import api from 'renderer/Api';
import { type ActiveCollectionDraftDriver, createActiveCollectionDraftDriver } from 'renderer/active-collection-draft-driver';
import { getCollectionModDataList } from 'renderer/collection-mod-list';
import { createCollectionValidationExecutor } from 'renderer/collection-validation-executor';
import {
	type CollectionContentSaveCompletion,
	type CollectionDraftEditResult,
	createCollectionWorkspaceSession
} from 'renderer/collection-workspace-session';
import { type CollectionWorkspaceAppState, useOptionalAppStateStore } from 'renderer/state/app-state';
import { useCollections } from './useCollections';

import { useModMetadata } from './useModMetadata';
import type { NotificationType } from './useNotifications';

interface UseCollectionWorkspaceSessionOptions {
	appState: CollectionWorkspaceAppState;
	gameRunning: boolean;
	launchMods: (mods: ModData[]) => Promise<void>;
	modalOpen: boolean;
	onLaunchStateCleared?: () => void;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	setModalType: (modalType: CollectionManagerModalType) => void;
}

function useInventoryUpdates(input: {
	appStore: ReturnType<typeof useOptionalAppStateStore>;
	driver: ActiveCollectionDraftDriver;
	contextRef: {
		current: {
			config: CollectionWorkspaceAppState['config'];
			mods: CollectionWorkspaceAppState['mods'];
			openNotification: UseCollectionWorkspaceSessionOptions['openNotification'];
		};
	};
	modsRef: { current: CollectionWorkspaceAppState['mods'] };
	mods: CollectionWorkspaceAppState['mods'];
	loadingMods: CollectionWorkspaceAppState['loadingMods'];
}) {
	const { appStore, driver, contextRef, modsRef, mods, loadingMods } = input;
	const previousMods = useRef(mods);
	useEffect(() => {
		if (!appStore) return;
		let previous = appStore.value;
		return appStore.subscribe(() => {
			const next = appStore.value;
			const before = previous;
			previous = next;
			contextRef.current = { ...contextRef.current, config: next.config, mods: next.mods };
			modsRef.current = next.mods;
			if (before.config !== next.config || before.activeCollection !== next.activeCollection) {
				driver.dispatch({ type: 'active-draft-changed', config: next.config, currentDraft: next.activeCollection });
			}
			if (before.mods !== next.mods) {
				previousMods.current = next.mods;
				driver.dispatch({ type: 'inventory-changed' });
				driver.dispatch({ type: 'mod-metadata-updated', loadingMods: next.loadingMods });
			}
		});
	}, [appStore, driver, contextRef, modsRef]);

	useEffect(() => {
		if (previousMods.current !== mods) {
			previousMods.current = mods;
			driver.dispatch({ type: 'inventory-changed' });
			driver.dispatch({ type: 'mod-metadata-updated', loadingMods });
		}
	}, [driver, mods, loadingMods]);
}

function useValidationExecutor(
	config: CollectionWorkspaceAppState['config'],
	mods: CollectionWorkspaceAppState['mods'],
	openNotification: UseCollectionWorkspaceSessionOptions['openNotification']
) {
	const contextRef = useRef({ config, mods, openNotification });
	contextRef.current = { config, mods, openNotification };
	const executorRef = useRef<ReturnType<typeof createCollectionValidationExecutor> | undefined>(undefined);
	executorRef.current ??= createCollectionValidationExecutor({
		getContext: () => contextRef.current,
		openNotification: (props, type) => contextRef.current.openNotification(props, type)
	});
	const executor = executorRef.current;
	return { contextRef, executor };
}

export function useCollectionWorkspaceSession({
	appState,
	gameRunning,
	launchMods,
	modalOpen,
	onLaunchStateCleared,
	openNotification,
	setModalType
}: UseCollectionWorkspaceSessionOptions): CollectionWorkspaceSessionView {
	const { activeCollection, config, launchingGame, loadingMods, mods, updateState } = appState;
	const appStore = useOptionalAppStateStore();
	const collectionsRef = useRef<ReturnType<typeof useCollections> | undefined>(undefined);
	const { contextRef, executor } = useValidationExecutor(config, mods, openNotification);
	const launchModsRef = useRef(launchMods);
	const modsRef = useRef(mods);
	const onLaunchStateClearedRef = useRef(onLaunchStateCleared);
	const setModalTypeRef = useRef(setModalType);
	const updateStateRef = useRef(updateState);

	const driverRef = useRef<ActiveCollectionDraftDriver | undefined>(undefined);
	driverRef.current ??= createActiveCollectionDraftDriver({
		initial: { config, draft: activeCollection },
		initialFacts: { gameRunning, launchingGame: !!launchingGame, loadingMods: !!loadingMods, savingDraft: false },
		adapters: {
			cancelValidation: () => executor.cancel(),
			clearCollectionErrors: () => {},
			clearLaunchState: () => {
				updateStateRef.current({ launchingGame: false });
				onLaunchStateClearedRef.current?.();
			},
			launchDraft: (draft) => launchModsRef.current(getCollectionModDataList(modsRef.current, draft)),
			openModal: (modalType) => setModalTypeRef.current(modalType),
			persistDraft: (draft) => collectionsRef.current?.persistCollection(draft),
			recalculateModData: () => collectionsRef.current?.recalculateModData(),
			setLaunchingGame: (nextLaunchingGame) => updateStateRef.current({ launchingGame: nextLaunchingGame }),
			validateDraft: (draft, launchIfValid, options) => executor.validate(draft, launchIfValid, options)
		}
	});
	const driver = driverRef.current;
	useAtomRef(driver.workflowRef);
	const collectionWorkspaceSession = driver.getSnapshot();

	useEffect(() => {
		return () => {
			driver.dispose();
			if (driverRef.current === driver) {
				driverRef.current = undefined;
			}
		};
	}, [driver]);

	const applyActiveDraftEdit = useCallback(
		(edit: CollectionDraftEditResult) => {
			driver.dispatch({ type: 'active-draft-edited', edit });
		},
		[driver]
	);

	const onCollectionContentSaveCompleted = useCallback(
		(completion: CollectionContentSaveCompletion) => {
			driver.dispatch({ type: 'collection-content-save-completed', completion });
		},
		[driver]
	);

	const onCollectionLifecycleResultApplied = useCallback(
		(result: { activeCollection: CollectionWorkspaceAppState['activeCollection']; config: CollectionWorkspaceAppState['config'] }) => {
			driver.dispatch({
				type: 'collection-lifecycle-result-applied',
				config: result.config,
				currentDraft: result.activeCollection
			});
		},
		[driver]
	);

	const collections = useCollections({
		activeCollectionDraft: collectionWorkspaceSession.draft,
		getDraftGeneration: () => driver.getWorkflowState().draftGeneration,
		appState,
		draftState: {
			hasUnsavedDraft: collectionWorkspaceSession.hasUnsavedDraft,
			setHasUnsavedDraft: (hasUnsavedDraft) => {
				driver.dispatch({ type: 'has-unsaved-draft-changed', hasUnsavedDraft });
			}
		},
		openNotification,
		resetValidationState: () => {},
		onCollectionContentSaveCompleted,
		onCollectionLifecycleResultApplied,
		onActiveDraftEdited: applyActiveDraftEdit
	});

	useLayoutEffect(() => {
		launchModsRef.current = launchMods;
		modsRef.current = mods;
		onLaunchStateClearedRef.current = onLaunchStateCleared;
		setModalTypeRef.current = setModalType;
		updateStateRef.current = updateState;
		collectionsRef.current = collections;
	}, [collections, launchMods, mods, onLaunchStateCleared, setModalType, updateState]);

	const validation = {
		validatingMods: collectionWorkspaceSession.validatingDraft,
		validationResult: collectionWorkspaceSession.validationResult,
		collectionErrors: collectionWorkspaceSession.currentCollectionErrors,
		lastValidationStatus: collectionWorkspaceSession.currentValidationStatus,
		lastValidatedCollectionKey: collectionWorkspaceSession.validationResult?.draftKey
	};

	useEffect(() => {
		driver.dispatch({
			type: 'runtime-facts-changed',
			facts: {
				gameRunning,
				loadingMods: !!loadingMods,
				savingDraft: collections.savingCollection
			}
		});
	}, [collections.savingCollection, driver, gameRunning, loadingMods]);

	useEffect(() => {
		driver.dispatch({ type: 'active-draft-changed', config, currentDraft: activeCollection });
	}, [activeCollection, config, driver]);

	useInventoryUpdates({ appStore, driver, contextRef, modsRef, mods, loadingMods });

	useEffect(() => {
		driver.dispatch({ type: 'loaded-mods-changed', loadingMods });
	}, [driver, loadingMods]);

	useModMetadata(appState, () => {});

	const validateCollection = useCallback(
		(options?: { config?: CollectionWorkspaceAppState['config'] }) => {
			driver.dispatch({ type: 'validate-requested', options });
		},
		[driver]
	);

	const launchGame = useCallback(async () => {
		api.logger.info('validating and launching game');
		driver.dispatch({ type: 'launch-requested', modalOpen });
	}, [driver, modalOpen]);

	const launchAnyway = useCallback(() => {
		driver.dispatch({ type: 'launch-anyway-requested' });
	}, [driver]);

	return {
		collections,
		collectionWorkspaceSession,
		currentCollectionErrors: collectionWorkspaceSession.currentCollectionErrors,
		currentValidationOutcome: collectionWorkspaceSession.currentValidationOutcome,
		currentValidationStatus: collectionWorkspaceSession.currentValidationStatus,
		launchAnyway,
		launchGame,
		validateCollection,
		validation
	};
}

type CollectionWorkspaceSessionView = {
	collections: ReturnType<typeof useCollections>;
	collectionWorkspaceSession: ReturnType<typeof createCollectionWorkspaceSession>;
	currentCollectionErrors: ReturnType<typeof createCollectionWorkspaceSession>['currentCollectionErrors'];
	currentValidationOutcome: ReturnType<typeof createCollectionWorkspaceSession>['currentValidationOutcome'];
	currentValidationStatus: ReturnType<typeof createCollectionWorkspaceSession>['currentValidationStatus'];
	launchAnyway: () => void;
	launchGame: () => Promise<void>;
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
	validation: {
		validatingMods: boolean;
		validationResult: ReturnType<typeof createCollectionWorkspaceSession>['validationResult'];
		collectionErrors: ReturnType<typeof createCollectionWorkspaceSession>['currentCollectionErrors'];
		lastValidationStatus: boolean | undefined;
		lastValidatedCollectionKey?: string;
	};
};

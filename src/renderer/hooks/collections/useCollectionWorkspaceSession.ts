import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from 'renderer/Api';
import { type ActiveCollectionDraftDriver, createActiveCollectionDraftDriver } from 'renderer/active-collection-draft-driver';
import { getCollectionModDataList } from 'renderer/collection-mod-list';
import {
	type CollectionContentSaveCompletion,
	type CollectionDraftEditResult,
	createCollectionWorkspaceSession
} from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { useCollections } from './useCollections';
import { useCollectionValidation } from './useCollectionValidation';
import { useModMetadata } from './useModMetadata';
import type { NotificationType } from './useNotifications';

interface UseCollectionWorkspaceSessionOptions {
	appState: CollectionWorkspaceAppState;
	gameRunning: boolean;
	launchMods: (mods: ModData[]) => Promise<void>;
	modalOpen: boolean;
	onLaunchStateCleared?: () => void;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	overrideGameRunning: boolean;
	setModalType: (modalType: CollectionManagerModalType) => void;
}

export function useCollectionWorkspaceSession({
	appState,
	gameRunning,
	launchMods,
	modalOpen,
	onLaunchStateCleared,
	openNotification,
	overrideGameRunning,
	setModalType
}: UseCollectionWorkspaceSessionOptions): CollectionWorkspaceSessionView {
	const { activeCollection, config, launchingGame, loadingMods, mods, updateState } = appState;
	const collectionsRef = useRef<ReturnType<typeof useCollections> | undefined>(undefined);
	const validationRef = useRef<ReturnType<typeof useCollectionValidation> | undefined>(undefined);
	const launchModsRef = useRef(launchMods);
	const modsRef = useRef(mods);
	const onLaunchStateClearedRef = useRef(onLaunchStateCleared);
	const setModalTypeRef = useRef(setModalType);
	const updateStateRef = useRef(updateState);
	launchModsRef.current = launchMods;
	modsRef.current = mods;
	onLaunchStateClearedRef.current = onLaunchStateCleared;
	setModalTypeRef.current = setModalType;
	updateStateRef.current = updateState;

	const driverRef = useRef<ActiveCollectionDraftDriver | undefined>(undefined);
	if (!driverRef.current) {
		driverRef.current = createActiveCollectionDraftDriver({
			initial: { config, draft: activeCollection },
			initialFacts: { gameRunning, launchingGame: !!launchingGame, loadingMods: !!loadingMods, overrideGameRunning, savingDraft: false },
			adapters: {
				cancelValidation: () => validationRef.current?.cancelValidation(),
				clearCollectionErrors: () => validationRef.current?.setCollectionErrors(undefined),
				clearLaunchState: () => {
					updateStateRef.current({ launchingGame: false });
					onLaunchStateClearedRef.current?.();
				},
				launchDraft: (draft) => launchModsRef.current(getCollectionModDataList(modsRef.current, draft)),
				openModal: (modalType) => setModalTypeRef.current(modalType),
				persistDraft: (draft) => collectionsRef.current?.persistCollection(draft),
				recalculateModData: () => collectionsRef.current?.recalculateModData(),
				setLaunchingGame: (nextLaunchingGame) => updateStateRef.current({ launchingGame: nextLaunchingGame }),
				validateDraft: (draft, launchIfValid, options) =>
					validationRef.current?.validateActiveCollection(launchIfValid, { ...options, collection: draft }) ??
					Promise.resolve({ type: 'cancelled' as const })
			}
		});
	}
	const driver = driverRef.current;
	const [collectionWorkspaceSession, setCollectionWorkspaceSession] = useState(() => driver.getSnapshot());

	useEffect(() => {
		return driver.subscribe(() => {
			setCollectionWorkspaceSession(driver.getSnapshot());
		});
	}, [driver]);

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
		appState,
		draftState: {
			hasUnsavedDraft: collectionWorkspaceSession.hasUnsavedDraft,
			setHasUnsavedDraft: (hasUnsavedDraft) => {
				driver.dispatch({ type: 'has-unsaved-draft-changed', hasUnsavedDraft });
			}
		},
		openNotification,
		resetValidationState: () => validationRef.current?.resetValidationState(),
		onCollectionContentSaveCompleted,
		onCollectionLifecycleResultApplied,
		onActiveDraftEdited: applyActiveDraftEdit
	});
	collectionsRef.current = collections;

	const validation = useCollectionValidation({
		activeCollectionDraft: collectionWorkspaceSession.draft,
		appState,
		openNotification
	});
	validationRef.current = validation;

	useEffect(() => {
		driver.dispatch({
			type: 'runtime-facts-changed',
			facts: {
				gameRunning,
				launchingGame: !!launchingGame,
				loadingMods: !!loadingMods,
				overrideGameRunning,
				savingDraft: collections.savingCollection
			}
		});
	}, [collections.savingCollection, driver, gameRunning, launchingGame, loadingMods, overrideGameRunning]);

	useEffect(() => {
		driver.dispatch({ type: 'active-draft-changed', config, currentDraft: activeCollection });
	}, [activeCollection, config, driver]);

	useEffect(() => {
		driver.dispatch({ type: 'loaded-mods-changed', loadingMods });
	}, [driver, loadingMods]);

	useModMetadata(appState, () => {
		driver.dispatch({ type: 'mod-metadata-updated', loadingMods });
	});

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
	currentCollectionErrors: ReturnType<typeof useCollectionValidation>['collectionErrors'];
	currentValidationOutcome: ReturnType<typeof createCollectionWorkspaceSession>['currentValidationOutcome'];
	currentValidationStatus: ReturnType<typeof useCollectionValidation>['lastValidationStatus'];
	launchAnyway: () => void;
	launchGame: () => Promise<void>;
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
	validation: ReturnType<typeof useCollectionValidation>;
};

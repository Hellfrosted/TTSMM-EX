import { useCallback, useEffect, useRef } from 'react';
import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import { useCollections } from 'renderer/hooks/collections/useCollections';
import { useCollectionValidation } from 'renderer/hooks/collections/useCollectionValidation';
import { useGameLaunch } from 'renderer/hooks/collections/useGameLaunch';
import { useGameRunning } from 'renderer/hooks/collections/useGameRunning';
import { useModMetadata } from 'renderer/hooks/collections/useModMetadata';
import type { NotificationType } from 'renderer/hooks/collections/useNotifications';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

interface ValidationCallbacks {
	cancelValidation: () => void;
	resetValidationState: () => void;
	validateActiveCollection: (launchIfValid: boolean, options?: { config?: CollectionWorkspaceAppState['config'] }) => Promise<void>;
}

interface UseCollectionWorkspaceOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	setModalType: (modalType: CollectionManagerModalType) => void;
}

interface CollectionWorkspaceResult {
	clearGameLaunchOverrideTimeout: ReturnType<typeof useGameRunning>['clearGameLaunchOverrideTimeout'];
	clearGameRunningPoll: ReturnType<typeof useGameRunning>['clearGameRunningPoll'];
	closeLaunchModal: (mods: ModData[]) => Promise<void>;
	collections: ReturnType<typeof useCollections>;
	currentCollectionErrors: ReturnType<typeof useCollectionValidation>['collectionErrors'];
	currentValidationStatus: ReturnType<typeof useCollectionValidation>['lastValidationStatus'];
	gameRunning: ReturnType<typeof useGameRunning>['gameRunning'];
	launchGameWithErrors: ReturnType<typeof useGameLaunch>['launchGameWithErrors'];
	overrideGameRunning: ReturnType<typeof useGameRunning>['overrideGameRunning'];
	pollGameRunning: ReturnType<typeof useGameRunning>['pollGameRunning'];
	scheduleLaunchOverrideReset: ReturnType<typeof useGameRunning>['scheduleLaunchOverrideReset'];
	setLaunchGameWithErrors: ReturnType<typeof useGameLaunch>['setLaunchGameWithErrors'];
	setOverrideGameRunning: ReturnType<typeof useGameRunning>['setOverrideGameRunning'];
	validation: ReturnType<typeof useCollectionValidation>;
}

export function useCollectionWorkspace({
	appState,
	openNotification,
	setModalType
}: UseCollectionWorkspaceOptions): CollectionWorkspaceResult {
	const validationCallbacksRef = useRef<ValidationCallbacks | undefined>(undefined);
	const hasValidatedLoadedModsRef = useRef(false);
	const { activeCollection, loadingMods } = appState;

	const {
		gameRunning,
		overrideGameRunning,
		setOverrideGameRunning,
		pollGameRunning,
		clearGameRunningPoll,
		clearGameLaunchOverrideTimeout,
		scheduleLaunchOverrideReset
	} = useGameRunning();

	const { launchGameWithErrors, setLaunchGameWithErrors, launchMods } = useGameLaunch({
		appState,
		openNotification,
		pollGameRunning,
		clearGameRunningPoll,
		clearGameLaunchOverrideTimeout,
		scheduleLaunchOverrideReset,
		setOverrideGameRunning
	});

	const closeLaunchModal = useCallback(
		async (mods: ModData[]) => {
			await launchMods(mods);
			setModalType(CollectionManagerModalType.NONE);
		},
		[launchMods, setModalType]
	);

	const collections = useCollections({
		appState,
		openNotification,
		cancelValidation: () => validationCallbacksRef.current?.cancelValidation(),
		resetValidationState: () => validationCallbacksRef.current?.resetValidationState(),
		validateActiveCollection: async (launchIfValid: boolean) => {
			await validationCallbacksRef.current?.validateActiveCollection(launchIfValid);
		},
		setModalType
	});

	const validation = useCollectionValidation({
		appState,
		openNotification,
		setModalType,
		persistCollection: collections.persistCollection,
		launchMods: closeLaunchModal
	});
	const { recalculateModData } = collections;
	const { validateActiveCollection } = validation;

	useEffect(() => {
		validationCallbacksRef.current = {
			cancelValidation: validation.cancelValidation,
			resetValidationState: validation.resetValidationState,
			validateActiveCollection: validation.validateActiveCollection
		};
	}, [validation.cancelValidation, validation.resetValidationState, validation.validateActiveCollection]);

	useEffect(() => {
		if (loadingMods) {
			hasValidatedLoadedModsRef.current = false;
			return;
		}

		recalculateModData();
		if (!hasValidatedLoadedModsRef.current) {
			hasValidatedLoadedModsRef.current = true;
			void validateActiveCollection(false);
		}
	}, [loadingMods, recalculateModData, validateActiveCollection]);

	const refreshModMetadata = useCallback(() => {
		recalculateModData();
		if (!loadingMods) {
			void validateActiveCollection(false);
		}
	}, [loadingMods, recalculateModData, validateActiveCollection]);

	useModMetadata(appState, refreshModMetadata);

	const currentValidationStatus = validation.isValidationCurrentForCollection(activeCollection)
		? validation.lastValidationStatus
		: undefined;
	const currentCollectionErrors = validation.isValidationCurrentForCollection(activeCollection) ? validation.collectionErrors : undefined;

	return {
		clearGameLaunchOverrideTimeout,
		clearGameRunningPoll,
		closeLaunchModal,
		collections,
		currentCollectionErrors,
		currentValidationStatus,
		gameRunning,
		launchGameWithErrors,
		overrideGameRunning,
		pollGameRunning,
		scheduleLaunchOverrideReset,
		setLaunchGameWithErrors,
		setOverrideGameRunning,
		validation
	};
}

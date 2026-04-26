import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import { markPerfInteraction } from 'renderer/perf';
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
}

interface CollectionWorkspaceResult {
	clearGameLaunchOverrideTimeout: ReturnType<typeof useGameRunning>['clearGameLaunchOverrideTimeout'];
	clearGameRunningPoll: ReturnType<typeof useGameRunning>['clearGameRunningPoll'];
	closeLaunchModal: (mods: ModData[]) => Promise<void>;
	closeModal: () => void;
	collections: ReturnType<typeof useCollections>;
	currentRecord: ModData | undefined;
	currentCollectionErrors: ReturnType<typeof useCollectionValidation>['collectionErrors'];
	currentValidationStatus: ReturnType<typeof useCollectionValidation>['lastValidationStatus'];
	detailsActiveTabKey: string;
	getModDetails: (uid: string, record: ModData, showBigDetails?: boolean) => void;
	gameRunning: ReturnType<typeof useGameRunning>['gameRunning'];
	bigDetails: boolean;
	launchGameWithErrors: ReturnType<typeof useGameLaunch>['launchGameWithErrors'];
	modalType: CollectionManagerModalType;
	openMainViewSettings: () => void;
	overrideGameRunning: ReturnType<typeof useGameRunning>['overrideGameRunning'];
	pollGameRunning: ReturnType<typeof useGameRunning>['pollGameRunning'];
	prewarmAlternateDetails: boolean;
	scheduleLaunchOverrideReset: ReturnType<typeof useGameRunning>['scheduleLaunchOverrideReset'];
	closeCurrentRecord: () => void;
	setBigDetails: (showBigDetails: boolean) => void;
	setDetailsActiveTabKey: (tabKey: string) => void;
	setLaunchGameWithErrors: ReturnType<typeof useGameLaunch>['setLaunchGameWithErrors'];
	setModalType: (modalType: CollectionManagerModalType) => void;
	setOverrideGameRunning: ReturnType<typeof useGameRunning>['setOverrideGameRunning'];
	setPrewarmAlternateDetails: (prewarmAlternateDetails: boolean) => void;
	validation: ReturnType<typeof useCollectionValidation>;
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
}

export function useCollectionWorkspace({ appState, openNotification }: UseCollectionWorkspaceOptions): CollectionWorkspaceResult {
	const validationCallbacksRef = useRef<ValidationCallbacks | undefined>(undefined);
	const hasValidatedLoadedModsRef = useRef(false);
	const [modalType, setModalType] = useState(CollectionManagerModalType.NONE);
	const [currentRecord, setCurrentRecord] = useState<ModData>();
	const [bigDetails, setBigDetailsState] = useState(true);
	const [detailsActiveTabKey, setDetailsActiveTabKey] = useState('info');
	const [prewarmAlternateDetails, setPrewarmAlternateDetails] = useState(false);
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
	const { setCollectionErrors, validateActiveCollection } = validation;

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
	const closeModal = useCallback(() => {
		setModalType(CollectionManagerModalType.NONE);
	}, []);
	const openMainViewSettings = useCallback(() => {
		setModalType(CollectionManagerModalType.VIEW_SETTINGS);
	}, []);
	const closeCurrentRecord = useCallback(() => {
		startTransition(() => {
			setCurrentRecord(undefined);
			setDetailsActiveTabKey('info');
			setPrewarmAlternateDetails(false);
		});
	}, []);
	const setBigDetails = useCallback((showBigDetails: boolean) => {
		startTransition(() => {
			setBigDetailsState(showBigDetails);
		});
	}, []);
	const getModDetails = useCallback(
		(uid: string, record: ModData, showBigDetails?: boolean) => {
			const isClosingCurrentRecord = currentRecord?.uid === uid;
			markPerfInteraction(isClosingCurrentRecord ? 'collection.details.close' : 'collection.details.open', {
				uid,
				showBigDetails: showBigDetails ?? bigDetails
			});
			startTransition(() => {
				setCurrentRecord(isClosingCurrentRecord ? undefined : record);
				if (!isClosingCurrentRecord) {
					setDetailsActiveTabKey('info');
					setPrewarmAlternateDetails(false);
				}
				if (!isClosingCurrentRecord && showBigDetails !== undefined) {
					setBigDetailsState(showBigDetails);
				}
			});
		},
		[bigDetails, currentRecord?.uid]
	);
	const validateCollection = useCallback(
		(options?: { config?: CollectionWorkspaceAppState['config'] }) => {
			setCollectionErrors(undefined);
			void validateActiveCollection(false, options);
		},
		[setCollectionErrors, validateActiveCollection]
	);

	return {
		clearGameLaunchOverrideTimeout,
		clearGameRunningPoll,
		bigDetails,
		closeCurrentRecord,
		closeLaunchModal,
		closeModal,
		collections,
		currentRecord,
		currentCollectionErrors,
		currentValidationStatus,
		detailsActiveTabKey,
		getModDetails,
		gameRunning,
		launchGameWithErrors,
		modalType,
		openMainViewSettings,
		overrideGameRunning,
		pollGameRunning,
		prewarmAlternateDetails,
		scheduleLaunchOverrideReset,
		setBigDetails,
		setDetailsActiveTabKey,
		setLaunchGameWithErrors,
		setModalType,
		setOverrideGameRunning,
		setPrewarmAlternateDetails,
		validation,
		validateCollection
	};
}

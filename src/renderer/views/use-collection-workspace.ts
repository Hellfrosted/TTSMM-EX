import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import { startTransition, useCallback, useState } from 'react';
import { useCollectionWorkspaceSession } from 'renderer/hooks/collections/useCollectionWorkspaceSession';
import { useGameLaunch } from 'renderer/hooks/collections/useGameLaunch';
import type { NotificationType } from 'renderer/hooks/collections/useNotifications';
import { markPerfInteraction } from 'renderer/perf';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

interface UseCollectionWorkspaceOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
}

type CollectionWorkspaceSessionController = ReturnType<typeof useCollectionWorkspaceSession>;

interface CollectionWorkspaceResult {
	closeLaunchModal: (mods: ModData[]) => Promise<void>;
	closeModal: () => void;
	collections: CollectionWorkspaceSessionController['collections'];
	collectionWorkspaceSession: CollectionWorkspaceSessionController['collectionWorkspaceSession'];
	currentRecord: ModData | undefined;
	currentCollectionErrors: CollectionWorkspaceSessionController['currentCollectionErrors'];
	currentValidationOutcome: CollectionWorkspaceSessionController['currentValidationOutcome'];
	currentValidationStatus: CollectionWorkspaceSessionController['currentValidationStatus'];
	detailsActiveTabKey: string;
	getModDetails: (uid: string, record: ModData, showBigDetails?: boolean) => void;
	effectiveGameRunning: boolean;
	bigDetails: boolean;
	launchGame: () => Promise<void>;
	launchAnyway: () => void;
	launchGameWithErrors: ReturnType<typeof useGameLaunch>['launchGameWithErrors'];
	modalType: CollectionManagerModalType;
	openMainViewSettings: () => void;
	prewarmAlternateDetails: boolean;
	closeCurrentRecord: () => void;
	setBigDetails: (showBigDetails: boolean) => void;
	setDetailsActiveTabKey: (tabKey: string) => void;
	setLaunchGameWithErrors: ReturnType<typeof useGameLaunch>['setLaunchGameWithErrors'];
	setModalType: (modalType: CollectionManagerModalType) => void;
	setPrewarmAlternateDetails: (prewarmAlternateDetails: boolean) => void;
	validation: CollectionWorkspaceSessionController['validation'];
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
}

export function useCollectionWorkspace({ appState, openNotification }: UseCollectionWorkspaceOptions): CollectionWorkspaceResult {
	const [modalType, setModalType] = useState(CollectionManagerModalType.NONE);
	const [currentRecord, setCurrentRecord] = useState<ModData>();
	const [bigDetails, setBigDetailsState] = useState(false);
	const [detailsActiveTabKey, setDetailsActiveTabKey] = useState('info');
	const [prewarmAlternateDetails, setPrewarmAlternateDetails] = useState(false);
	const { effectiveGameRunning, launchGameWithErrors, setLaunchGameWithErrors, launchMods } = useGameLaunch({
		appState,
		openNotification
	});

	const closeLaunchModal = useCallback(
		async (mods: ModData[]) => {
			await launchMods(mods);
			setModalType(CollectionManagerModalType.NONE);
		},
		[launchMods]
	);

	const {
		collections,
		collectionWorkspaceSession,
		currentCollectionErrors,
		currentValidationOutcome,
		currentValidationStatus,
		launchAnyway: launchAnywayFromWorkflow,
		launchGame,
		validateCollection,
		validation
	} = useCollectionWorkspaceSession({
		appState,
		gameRunning: effectiveGameRunning,
		launchMods: closeLaunchModal,
		modalOpen: modalType !== CollectionManagerModalType.NONE,
		onLaunchStateCleared: () => setLaunchGameWithErrors(false),
		openNotification,
		setModalType
	});
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
			const nextBigDetails = showBigDetails ?? false;
			markPerfInteraction(isClosingCurrentRecord ? 'collection.details.close' : 'collection.details.open', {
				uid,
				showBigDetails: nextBigDetails
			});
			startTransition(() => {
				setCurrentRecord(isClosingCurrentRecord ? undefined : record);
				if (!isClosingCurrentRecord) {
					setPrewarmAlternateDetails(false);
					setBigDetailsState(nextBigDetails);
				}
			});
		},
		[currentRecord?.uid]
	);
	const launchAnyway = useCallback(async () => {
		setLaunchGameWithErrors(true);
		launchAnywayFromWorkflow();
	}, [launchAnywayFromWorkflow, setLaunchGameWithErrors]);

	return {
		bigDetails,
		closeCurrentRecord,
		closeLaunchModal,
		closeModal,
		collections,
		collectionWorkspaceSession,
		currentRecord,
		currentCollectionErrors,
		currentValidationOutcome,
		currentValidationStatus,
		detailsActiveTabKey,
		getModDetails,
		effectiveGameRunning,
		launchGame,
		launchAnyway,
		launchGameWithErrors,
		modalType,
		openMainViewSettings,
		prewarmAlternateDetails,
		setBigDetails,
		setDetailsActiveTabKey,
		setLaunchGameWithErrors,
		setModalType,
		setPrewarmAlternateDetails,
		validation,
		validateCollection
	};
}

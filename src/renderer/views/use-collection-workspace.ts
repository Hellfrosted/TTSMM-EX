import { startTransition, useCallback, useState } from 'react';
import { CollectionManagerModalType, type ModData, type NotificationProps } from 'model';
import { getCollectionModDataList } from 'renderer/collection-mod-projection';
import { markPerfInteraction } from 'renderer/perf';
import { useCollectionWorkspaceSession } from 'renderer/hooks/collections/useCollectionWorkspaceSession';
import { useGameLaunch } from 'renderer/hooks/collections/useGameLaunch';
import { useGameRunning } from 'renderer/hooks/collections/useGameRunning';
import type { NotificationType } from 'renderer/hooks/collections/useNotifications';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

interface UseCollectionWorkspaceOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
}

type CollectionWorkspaceSessionController = ReturnType<typeof useCollectionWorkspaceSession>;

interface CollectionWorkspaceResult {
	clearGameLaunchOverrideTimeout: ReturnType<typeof useGameRunning>['clearGameLaunchOverrideTimeout'];
	clearGameRunningPoll: ReturnType<typeof useGameRunning>['clearGameRunningPoll'];
	closeLaunchModal: (mods: ModData[]) => Promise<void>;
	closeModal: () => void;
	collections: CollectionWorkspaceSessionController['collections'];
	collectionWorkspaceSession: CollectionWorkspaceSessionController['collectionWorkspaceSession'];
	currentRecord: ModData | undefined;
	currentCollectionErrors: CollectionWorkspaceSessionController['currentCollectionErrors'];
	currentValidationStatus: CollectionWorkspaceSessionController['currentValidationStatus'];
	detailsActiveTabKey: string;
	getModDetails: (uid: string, record: ModData, showBigDetails?: boolean) => void;
	gameRunning: ReturnType<typeof useGameRunning>['gameRunning'];
	bigDetails: boolean;
	launchGame: () => Promise<void>;
	launchAnyway: () => void;
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
	validation: CollectionWorkspaceSessionController['validation'];
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
}

export function useCollectionWorkspace({ appState, openNotification }: UseCollectionWorkspaceOptions): CollectionWorkspaceResult {
	const [modalType, setModalType] = useState(CollectionManagerModalType.NONE);
	const [currentRecord, setCurrentRecord] = useState<ModData>();
	const [bigDetails, setBigDetailsState] = useState(false);
	const [detailsActiveTabKey, setDetailsActiveTabKey] = useState('info');
	const [prewarmAlternateDetails, setPrewarmAlternateDetails] = useState(false);
	const { activeCollection } = appState;

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
		[launchMods]
	);

	const {
		collections,
		collectionWorkspaceSession,
		currentCollectionErrors,
		currentValidationStatus,
		launchGame,
		validateCollection,
		validation
	} = useCollectionWorkspaceSession({
		appState,
		gameRunning,
		launchMods: closeLaunchModal,
		modalOpen: modalType !== CollectionManagerModalType.NONE,
		openNotification,
		overrideGameRunning,
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
	const launchAnyway = useCallback(() => {
		setLaunchGameWithErrors(true);
		const modList = getCollectionModDataList(appState.mods, activeCollection);
		void closeLaunchModal(modList);
	}, [activeCollection, appState.mods, closeLaunchModal, setLaunchGameWithErrors]);

	return {
		clearGameLaunchOverrideTimeout,
		clearGameRunningPoll,
		bigDetails,
		closeCurrentRecord,
		closeLaunchModal,
		closeModal,
		collections,
		collectionWorkspaceSession,
		currentRecord,
		currentCollectionErrors,
		currentValidationStatus,
		detailsActiveTabKey,
		getModDetails,
		gameRunning,
		launchGame,
		launchAnyway,
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

import { ReactNode, memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button, Layout, Popover } from 'antd';
import {
	AppState,
	CollectionManagerModalType,
	CollectionViewProps,
	CollectionViewType,
	MainColumnTitles,
	ModCollection,
	ModData,
	getByUID,
	getRows
} from 'model';
import api from 'renderer/Api';
import CollectionManagerToolbar from '../components/collections/CollectionManagementToolbar';
import { MainCollectionView } from '../components/collections/MainCollectionComponent';
import ModDetailsFooter from '../components/collections/ModDetailsFooter';
import ModLoadingView from '../components/loading/ModLoading';
import CollectionManagerModal from '../components/collections/CollectionManagerModal';
import { useNotifications } from '../hooks/collections/useNotifications';
import { useGameRunning } from '../hooks/collections/useGameRunning';
import { useGameLaunch } from '../hooks/collections/useGameLaunch';
import { useCollections } from '../hooks/collections/useCollections';
import { useCollectionValidation } from '../hooks/collections/useCollectionValidation';
import { useModMetadata } from '../hooks/collections/useModMetadata';
import { cloneAppConfig } from '../hooks/collections/utils';
import { writeConfig } from '../util/config-write';

const { Header, Footer } = Layout;

interface MeasuredAreaProps {
	children: (size: { width: number; height: number }) => ReactNode;
	onSizeChange?: (size: { width: number; height: number }) => void;
}

function MeasuredArea({ children, onSizeChange }: MeasuredAreaProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		onSizeChange?.(size);
	}, [onSizeChange, size]);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) {
			return;
		}

		const updateSize = (width: number, height: number) => {
			const roundedWidth = Math.round(width);
			const roundedHeight = Math.round(height);
			setSize((current) => {
				if (current.width === roundedWidth && current.height === roundedHeight) {
					return current;
				}
				return { width: roundedWidth, height: roundedHeight };
			});
		};

		const { width, height } = element.getBoundingClientRect();
		updateSize(width, height);

		if (typeof ResizeObserver === 'undefined') {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const [entry] = entries;
			if (!entry) {
				return;
			}

			updateSize(entry.contentRect.width, entry.contentRect.height);
		});

		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, [onSizeChange]);

	return (
		<div
			ref={containerRef}
			style={{
				flex: 1,
				display: 'flex',
				minWidth: 0,
				minHeight: 0,
				width: '100%',
				height: '100%',
				overflow: 'hidden'
			}}
		>
			{children(size)}
		</div>
	);
}

type HalfDetailsLayout = 'bottom' | 'side';

interface ValidationCallbacks {
	cancelValidation: () => void;
	resetValidationState: () => void;
	validateActiveCollection: (launchIfValid: boolean, options?: { config?: AppState['config'] }) => Promise<void>;
}

interface CollectionViewRouteProps {
	appState: AppState;
}

function CollectionViewComponent({ appState }: CollectionViewRouteProps) {
	const { openNotification } = useNotifications();
	const [modalType, setModalType] = useState(CollectionManagerModalType.NONE);
	const [currentRecord, setCurrentRecord] = useState<ModData>();
	const [bigDetails, setBigDetails] = useState(true);
	const [detailsActiveTabKey, setDetailsActiveTabKey] = useState('info');
	const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
	const [preferredHalfDetailsLayout, setPreferredHalfDetailsLayout] = useState<HalfDetailsLayout>();
	const [prewarmAlternateDetails, setPrewarmAlternateDetails] = useState(false);
	const validationCallbacksRef = useRef<ValidationCallbacks | undefined>(undefined);
	const hasValidatedLoadedModsRef = useRef(false);
	const guidedFixActive = false;

	const { gameRunning, overrideGameRunning, setOverrideGameRunning, pollGameRunning, clearGameRunningPoll, clearGameLaunchOverrideTimeout, scheduleLaunchOverrideReset } =
		useGameRunning();

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

	const {
		searchString,
		madeEdits,
		filteredRows,
		savingCollection,
		onSearchChange,
		onSearch,
		changeActiveCollection,
		createNewCollection,
		duplicateCollection,
		renameCollection,
		saveCollection,
		deleteCollection,
		setEnabledMods,
		toggleMod,
		setModSubset,
		recalculateModData
	} = collections;
	const {
		collectionErrors,
		validatingMods,
		lastValidationStatus,
		setCollectionErrors,
		validateActiveCollection,
		isValidationCurrentForCollection
	} = validation;

	const currentValidationStatus = isValidationCurrentForCollection(appState.activeCollection) ? lastValidationStatus : undefined;
	const currentCollectionErrors = isValidationCurrentForCollection(appState.activeCollection) ? collectionErrors : undefined;

	useEffect(() => {
		validationCallbacksRef.current = {
			cancelValidation: validation.cancelValidation,
			resetValidationState: validation.resetValidationState,
			validateActiveCollection: validation.validateActiveCollection
		};
	}, [validation.cancelValidation, validation.resetValidationState, validation.validateActiveCollection]);

	useEffect(() => {
		if (appState.loadingMods) {
			hasValidatedLoadedModsRef.current = false;
			return;
		}

		recalculateModData();
		if (!hasValidatedLoadedModsRef.current) {
			hasValidatedLoadedModsRef.current = true;
			void validateActiveCollection(false);
		}
	}, [appState.loadingMods, recalculateModData, validateActiveCollection]);

	useModMetadata(appState, () => {
		recalculateModData();
		if (!appState.loadingMods) {
			void validateActiveCollection(false);
		}
	});

	const launchGame = useCallback(async () => {
		api.logger.info('validating and launching game');
		const { activeCollection, loadingMods, mods } = appState;

		if (loadingMods) {
			return;
		}

		if (currentValidationStatus && !madeEdits && activeCollection) {
			const modDataList = activeCollection.mods
				.map((modUID) => getByUID(mods, modUID))
				.filter((modData): modData is ModData => !!modData);
			await closeLaunchModal(modDataList);
			return;
		}

		appState.updateState({ launchingGame: true });
		setCollectionErrors(undefined);
		await validateActiveCollection(true);
	}, [appState, closeLaunchModal, currentValidationStatus, madeEdits, setCollectionErrors, validateActiveCollection]);

	const currentView = CollectionViewType.MAIN;

	const rows = useMemo(() => getRows(appState.mods), [appState.mods]);
	const visibleRows = filteredRows || rows;
	const displayedCurrentRecord = currentRecord ? getByUID(appState.mods, currentRecord.uid) || currentRecord : undefined;
	const currentViewConfig = appState.config.viewConfigs?.[currentView];
	const automaticHalfDetailsLayout: HalfDetailsLayout = contentSize.width > contentSize.height * 1.45 ? 'side' : 'bottom';
	const halfDetailsLayout = preferredHalfDetailsLayout || automaticHalfDetailsLayout;
	const handleEnableMod = useCallback(
		(id: string) => {
			toggleMod(true, id);
		},
		[toggleMod]
	);
	const handleDisableMod = useCallback(
		(id: string) => {
			toggleMod(false, id);
		},
		[toggleMod]
	);
	const handleCloseCurrentRecord = useCallback(() => {
		startTransition(() => {
			setCurrentRecord(undefined);
			setDetailsActiveTabKey('info');
			setPrewarmAlternateDetails(false);
		});
	}, []);
	const handleExpandFooter = useCallback((showBigDetails: boolean) => {
		startTransition(() => {
			setBigDetails(showBigDetails);
		});
	}, []);
	const handleToggleHalfLayout = useCallback(() => {
		startTransition(() => {
			setPreferredHalfDetailsLayout(halfDetailsLayout === 'side' ? 'bottom' : 'side');
		});
	}, [halfDetailsLayout]);
	const handleValidateCollection = useCallback((options?: { config?: AppState['config'] }) => {
		setCollectionErrors(undefined);
		void validateActiveCollection(false, options);
	}, [setCollectionErrors, validateActiveCollection]);
	const handleReloadModList = useCallback(() => {
		setCurrentRecord(undefined);
		appState.updateState({ loadingMods: true, forceReloadMods: true });
	}, [appState]);
	const handleSaveCollection = useCallback(() => {
		if (appState.activeCollection) {
			void saveCollection(appState.activeCollection, true);
		}
	}, [appState.activeCollection, saveCollection]);
	const handleOpenViewSettings = useCallback(() => {
		setModalType(CollectionManagerModalType.VIEW_SETTINGS);
	}, []);
	const handleSetMainColumnWidth = useCallback(
		async (column: MainColumnTitles, width: number) => {
			const normalizedWidth = Math.max(80, Math.round(width));
			const nextConfig = cloneAppConfig(appState.config);
			const currentMainConfig = nextConfig.viewConfigs.main ? { ...nextConfig.viewConfigs.main } : {};
			const currentColumnWidthConfig = currentMainConfig.columnWidthConfig || {};
			if (currentColumnWidthConfig[column] === normalizedWidth) {
				return true;
			}

			currentMainConfig.columnWidthConfig = {
				...currentColumnWidthConfig,
				[column]: normalizedWidth
			};
			nextConfig.viewConfigs.main = currentMainConfig;

			try {
				await writeConfig(nextConfig);
				appState.updateState({ config: nextConfig });
				return true;
			} catch (error) {
				api.logger.error(error);
				openNotification(
					{
						message: 'Failed to update view settings',
						placement: 'bottomLeft',
						duration: null
					},
					'error'
				);
				return false;
			}
		},
		[appState, openNotification]
	);
	const handleLaunchAnyway = useCallback(() => {
		setLaunchGameWithErrors(true);
		const modList = (appState.activeCollection ? appState.activeCollection.mods.map((mod) => getByUID(appState.mods, mod)) : []).filter(
			(modData): modData is ModData => !!modData
		);
		void closeLaunchModal(modList);
	}, [appState.activeCollection, appState.mods, closeLaunchModal, setLaunchGameWithErrors]);
	const handleCloseModal = useCallback(() => {
		setModalType(CollectionManagerModalType.NONE);
	}, []);
	const handleDeleteCollection = useCallback(() => {
		void deleteCollection();
	}, [deleteCollection]);
	const handleGetModDetails = useCallback(
		(uid: string, record: ModData, showBigDetails?: boolean) => {
			const isClosingCurrentRecord = currentRecord?.uid === uid;
			startTransition(() => {
				setCurrentRecord(isClosingCurrentRecord ? undefined : record);
				if (!isClosingCurrentRecord) {
					setDetailsActiveTabKey('info');
					setPrewarmAlternateDetails(false);
				}
				if (!isClosingCurrentRecord && showBigDetails !== undefined) {
					setBigDetails(showBigDetails);
				}
			});
		},
		[currentRecord?.uid]
	);

	useEffect(() => {
		if (!displayedCurrentRecord || appState.loadingMods || currentView !== CollectionViewType.MAIN) {
			const resetTimeout = window.setTimeout(() => {
				setPrewarmAlternateDetails(false);
			}, 0);

			return () => {
				window.clearTimeout(resetTimeout);
			};
		}

		const warmDetailsLayouts = () => {
			setPrewarmAlternateDetails(true);
		};

		if (typeof window.requestIdleCallback === 'function') {
			const idleHandle = window.requestIdleCallback(warmDetailsLayouts, { timeout: 1000 });
			return () => {
				window.cancelIdleCallback(idleHandle);
			};
		}

		const timeout = window.setTimeout(warmDetailsLayouts, 250);
		return () => {
			window.clearTimeout(timeout);
		};
	}, [appState.loadingMods, currentView, displayedCurrentRecord]);

	const collectionComponentProps: CollectionViewProps = useMemo(
		() => ({
			madeEdits,
			lastValidationStatus: currentValidationStatus,
			rows,
			filteredRows: visibleRows,
			height: '100%',
			width: '100%',
			collection: appState.activeCollection as ModCollection,
			launchingGame: appState.launchingGame,
			config: currentViewConfig,
			setEnabledModsCallback: setEnabledMods,
			setEnabledCallback: handleEnableMod,
			setDisabledCallback: handleDisableMod,
			setMainColumnWidthCallback: handleSetMainColumnWidth,
			getModDetails: handleGetModDetails
		}),
		[
			appState.activeCollection,
			appState.launchingGame,
			currentViewConfig,
			handleDisableMod,
			handleEnableMod,
			handleGetModDetails,
			handleSetMainColumnWidth,
			currentValidationStatus,
			madeEdits,
			rows,
			setEnabledMods,
			visibleRows
		]
	);

	const showSideBySideDetails = currentView === CollectionViewType.MAIN && !!displayedCurrentRecord && !bigDetails && halfDetailsLayout === 'side';
	const sideDetailsWidth = showSideBySideDetails
		? Math.max(420, Math.min(Math.round(contentSize.width * 0.42), 760))
		: 0;
	const bottomDetailsHeight =
		currentView === CollectionViewType.MAIN && displayedCurrentRecord && !bigDetails && !showSideBySideDetails
			? Math.min(Math.max(260, Math.round(contentSize.height * 0.42)), Math.max(180, contentSize.height - 140))
			: 0;
	const footerBorderColor = '1px solid rgba(255, 255, 255, 0.08)';
	const showExpandedDetails = currentView === CollectionViewType.MAIN && !!displayedCurrentRecord && bigDetails;
	const showExpandedDetailsSurface = showExpandedDetails && !appState.loadingMods;
	const shouldRenderExpandedDetailsSurface = !!displayedCurrentRecord && (showExpandedDetailsSurface || prewarmAlternateDetails);
	const fullDetailsFooter = displayedCurrentRecord ? (
		<ModDetailsFooter
			key="mod-details-full"
			lastValidationStatus={currentValidationStatus}
			appState={appState}
			bigDetails
			halfLayoutMode={halfDetailsLayout}
			currentRecord={displayedCurrentRecord}
			activeTabKey={detailsActiveTabKey}
			setActiveTabKey={setDetailsActiveTabKey}
			closeFooterCallback={handleCloseCurrentRecord}
			enableModCallback={handleEnableMod}
			disableModCallback={handleDisableMod}
			expandFooterCallback={handleExpandFooter}
			toggleHalfLayoutCallback={handleToggleHalfLayout}
			setModSubsetCallback={setModSubset}
			openNotification={openNotification}
			validateCollection={handleValidateCollection}
			openModal={setModalType}
		/>
	) : null;
	const halfDetailsFooter = displayedCurrentRecord ? (
		<ModDetailsFooter
			key="mod-details-half"
			lastValidationStatus={currentValidationStatus}
			appState={appState}
			bigDetails={false}
			halfLayoutMode={halfDetailsLayout}
			currentRecord={displayedCurrentRecord}
			activeTabKey={detailsActiveTabKey}
			setActiveTabKey={setDetailsActiveTabKey}
			closeFooterCallback={handleCloseCurrentRecord}
			enableModCallback={handleEnableMod}
			disableModCallback={handleDisableMod}
			expandFooterCallback={handleExpandFooter}
			toggleHalfLayoutCallback={handleToggleHalfLayout}
			setModSubsetCallback={setModSubset}
			openNotification={openNotification}
			validateCollection={handleValidateCollection}
			openModal={setModalType}
			/>
		) : null;

	return (
		<Layout className="CollectionViewLayout" style={{ flex: '1 1 0', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
			<Header className="CollectionHeader" style={{ height: 'auto', minHeight: 120, lineHeight: 'normal' }}>
				<CollectionManagerToolbar
					appState={appState}
					searchString={searchString || ''}
					validatingCollection={validatingMods}
					savingCollection={savingCollection}
					onSearchChangeCallback={onSearchChange}
					validateCollectionCallback={handleValidateCollection}
					madeEdits={madeEdits}
					lastValidationStatus={currentValidationStatus}
					onReloadModListCallback={handleReloadModList}
					onSearchCallback={onSearch}
					changeActiveCollectionCallback={changeActiveCollection}
					numResults={filteredRows ? filteredRows.length : appState.mods.modIdToModDataMap.size}
					newCollectionCallback={createNewCollection}
					duplicateCollectionCallback={duplicateCollection}
					renameCollectionCallback={renameCollection}
					saveCollectionCallback={handleSaveCollection}
					openViewSettingsCallback={handleOpenViewSettings}
					openNotification={openNotification}
					openModal={setModalType}
				/>
			</Header>
			<CollectionManagerModal
				appState={appState}
				launchAnyway={handleLaunchAnyway}
				modalType={modalType}
				launchGameWithErrors={!!launchGameWithErrors}
				currentView={currentView}
				collectionErrors={currentCollectionErrors}
				openNotification={openNotification}
				closeModal={handleCloseModal}
				currentRecord={displayedCurrentRecord}
				deleteCollection={handleDeleteCollection}
			/>
			<div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<div className="CollectionContentStageHost">
					<div className={`CollectionContentStage${showExpandedDetailsSurface ? '' : ' is-active'}`}>
						<MeasuredArea onSizeChange={setContentSize}>
							{() => {
								let actualContent = null;
								if (appState.loadingMods) {
									actualContent = (
										<ModLoadingView
											appState={appState}
											modLoadCompleteCallback={() => {
												recalculateModData();
											}}
										/>
									);
								} else if (!guidedFixActive) {
									const outlet = <MainCollectionView {...collectionComponentProps} />;

									if (displayedCurrentRecord && currentView === CollectionViewType.MAIN && !bigDetails) {
										if (showSideBySideDetails) {
											actualContent = (
												<div
													style={{
														display: 'flex',
														flex: 1,
														minWidth: 0,
														minHeight: 0,
														width: '100%',
														height: '100%',
														overflow: 'hidden'
													}}
												>
													<div
														key="collection"
														style={{
															flex: '1 1 0',
															minWidth: 0,
															minHeight: 0,
															height: '100%',
															padding: '0px',
															overflow: 'hidden'
														}}
													>
														{outlet}
													</div>
													<div
														className="CollectionSplitDetailsPane CollectionSplitDetailsPane--side"
														style={{
															flex: `0 0 ${sideDetailsWidth}px`,
															width: sideDetailsWidth,
															minWidth: sideDetailsWidth,
															minHeight: 0,
															overflow: 'hidden',
															borderLeft: footerBorderColor
														}}
													>
														{halfDetailsFooter}
													</div>
												</div>
											);
										} else {
											actualContent = (
												<div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
													<div
														key="collection"
														style={{
															flex: '1 1 0',
															minWidth: 0,
															minHeight: 0,
															height: '100%',
															padding: '0px',
															overflow: 'hidden'
														}}
													>
														{outlet}
													</div>
													<div
														className="CollectionSplitDetailsPane CollectionSplitDetailsPane--bottom"
														style={{
															flex: `0 0 ${bottomDetailsHeight}px`,
															minHeight: bottomDetailsHeight,
															maxHeight: bottomDetailsHeight,
															overflow: 'hidden',
															borderTop: footerBorderColor
														}}
													>
														{halfDetailsFooter}
													</div>
												</div>
											);
										}
									} else {
										actualContent = (
											<div
												key="collection"
												style={{
													flex: 1,
													minWidth: 0,
													minHeight: 0,
													height: '100%',
													padding: '0px',
													overflow: 'hidden'
												}}
											>
												{outlet}
											</div>
										);
									}
								}

								return actualContent || <></>;
							}}
						</MeasuredArea>
					</div>
					{shouldRenderExpandedDetailsSurface ? (
						<div className={`CollectionContentStage CollectionContentStage--details${showExpandedDetailsSurface ? ' is-active' : ''}`}>
							{fullDetailsFooter}
						</div>
					) : null}
				</div>
			</div>
			{showExpandedDetails ? null : (
				<Footer className="MainFooter" style={{ flex: '0 0 auto', justifyContent: 'center', display: 'flex', padding: 10 }}>
					{appState.launchingGame ? (
						<Popover content="Already launching game">
							<Button
								type="primary"
								loading={appState.launchingGame}
								disabled={
									appState.loadingMods ||
									overrideGameRunning ||
									gameRunning ||
									modalType !== CollectionManagerModalType.NONE ||
									appState.launchingGame
								}
								onClick={() => {
									void launchGame();
								}}
							>
								Launch Game
							</Button>
						</Popover>
					) : gameRunning || overrideGameRunning ? (
						<Popover content="Game already running">
							<Button
								type="primary"
								loading={appState.launchingGame}
								disabled={
									appState.loadingMods ||
									overrideGameRunning ||
									gameRunning ||
									modalType !== CollectionManagerModalType.NONE ||
									appState.launchingGame
								}
								onClick={() => {
									void launchGame();
								}}
							>
								Launch Game
							</Button>
						</Popover>
					) : (
						<Button
							type="primary"
							loading={appState.launchingGame}
							disabled={
								appState.loadingMods ||
								overrideGameRunning ||
								gameRunning ||
								modalType !== CollectionManagerModalType.NONE ||
								appState.launchingGame
							}
							onClick={() => {
								void launchGame();
							}}
						>
							Launch Game
						</Button>
					)}
				</Footer>
			)}
		</Layout>
	);
}

export const CollectionView = memo(CollectionViewComponent);

export default function CollectionRoute() {
	return <CollectionView appState={useOutletContext<AppState>()} />;
}

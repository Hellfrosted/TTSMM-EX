import {
	Profiler,
	ReactNode,
	Suspense,
	lazy,
	memo,
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties
} from 'react';
import { useOutletContext } from 'react-router-dom';
import { CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { CollectionManagerModalType, CollectionViewProps, CollectionViewType, MainColumnTitles, ModCollection } from 'model';
import api from 'renderer/Api';
import {
	desktopButtonBaseClassName,
	desktopControlFocusClassName,
	desktopDangerButtonToneClassName,
	desktopDefaultButtonToneClassName,
	desktopDisabledClassName,
	desktopPrimaryButtonToneClassName
} from 'renderer/components/desktop-control-classes';
import CollectionManagerToolbar from '../components/collections/CollectionManagementToolbar';
import ViewStageLoadingFallback from '../components/loading/ViewStageLoadingFallback';
import { useNotifications } from '../hooks/collections/useNotifications';
import { logProfilerRender, measurePerf } from '../perf';
import { getCollectionModDataList, getCollectionRows, getDisplayedCollectionRecord } from '../collection-mod-projection';
import type { CollectionWorkspaceAppState } from '../state/app-state';
import {
	moveMainCollectionColumn,
	persistViewConfig,
	setMainCollectionColumnVisibility,
	setMainCollectionColumnWidth
} from '../view-config-persistence';
import { useCollectionWorkspace } from './use-collection-workspace';

const loadModDetailsFooter = () => import('../components/collections/ModDetailsFooter');
const loadCollectionManagerModal = () => import('../components/collections/CollectionManagerModal');
const loadMainCollectionView = () => import('../components/collections/MainCollectionComponent');
const loadModLoadingView = () => import('../components/loading/ModLoading');

const ModDetailsFooterLazy = lazy(async () => {
	const module = await loadModDetailsFooter();
	return { default: module.default };
});

const CollectionManagerModalLazy = lazy(async () => {
	const module = await loadCollectionManagerModal();
	return { default: module.default };
});

const MainCollectionViewLazy = lazy(async () => {
	const module = await loadMainCollectionView();
	return { default: module.MainCollectionView };
});

const ModLoadingViewLazy = lazy(async () => {
	const module = await loadModLoadingView();
	return { default: module.default };
});

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
		<div ref={containerRef} className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
			{children(size)}
		</div>
	);
}

function collectionSplitSizeStyle(size: number): CSSProperties {
	return {
		'--collection-split-size': `${size}px`
	} as CSSProperties;
}

const collectionFooterButtonClassName = [
	desktopButtonBaseClassName,
	desktopDefaultButtonToneClassName,
	desktopDisabledClassName,
	'px-4',
	desktopControlFocusClassName
].join(' ');
const collectionFooterPrimaryButtonClassName = [collectionFooterButtonClassName, desktopPrimaryButtonToneClassName].join(' ');
const collectionFooterDangerButtonClassName = [collectionFooterButtonClassName, desktopDangerButtonToneClassName].join(' ');
const collectionContentStageBaseClassName =
	'absolute inset-0 flex min-h-0 min-w-0 overflow-hidden opacity-0 invisible pointer-events-none contain-[layout_paint_style] [content-visibility:hidden] transition-[opacity,visibility] duration-[140ms] motion-reduce:transition-none';
const collectionContentStageActiveClassName = 'opacity-100 visible pointer-events-auto [content-visibility:visible]';
const collectionSplitLayoutBaseClassName = 'flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden';
const collectionSplitPaneBaseClassName = 'min-h-0 min-w-0 overflow-hidden';

type HalfDetailsLayout = 'bottom' | 'side';
const MIN_SIDE_BY_SIDE_WIDTH = 1120;
const MIN_COLLECTION_TABLE_WIDTH = 640;
const MIN_COLLECTION_TABLE_HEIGHT = 320;

interface CollectionViewRouteProps {
	appState: CollectionWorkspaceAppState;
}

function CollectionViewComponent({ appState }: CollectionViewRouteProps) {
	const { openNotification } = useNotifications();
	const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
	const [preferredHalfDetailsLayout, setPreferredHalfDetailsLayout] = useState<HalfDetailsLayout>();
	const guidedFixActive = false;
	const { activeCollection, config, loadingMods, mods, updateState } = appState;

	const {
		bigDetails,
		closeCurrentRecord,
		closeModal,
		gameRunning,
		getModDetails: handleGetModDetails,
		overrideGameRunning,
		launchGameWithErrors,
		modalType,
		openMainViewSettings,
		prewarmAlternateDetails,
		setPrewarmAlternateDetails,
		setLaunchGameWithErrors,
		closeLaunchModal,
		collections,
		validation,
		currentValidationStatus,
		currentCollectionErrors,
		currentRecord,
		detailsActiveTabKey,
		setBigDetails: handleExpandFooter,
		setDetailsActiveTabKey,
		setModalType,
		validateCollection: handleValidateCollection
	} = useCollectionWorkspace({
		appState,
		openNotification
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
		setModSubset
	} = collections;
	const { validatingMods, setCollectionErrors, validateActiveCollection } = validation;

	const launchGame = useCallback(async () => {
		api.logger.info('validating and launching game');

		if (loadingMods) {
			return;
		}

		if (currentValidationStatus && !madeEdits && activeCollection) {
			const modDataList = getCollectionModDataList(mods, activeCollection);
			await closeLaunchModal(modDataList);
			return;
		}

		updateState({ launchingGame: true });
		setCollectionErrors(undefined);
		await validateActiveCollection(true);
	}, [
		activeCollection,
		closeLaunchModal,
		currentValidationStatus,
		loadingMods,
		madeEdits,
		mods,
		setCollectionErrors,
		updateState,
		validateActiveCollection
	]);

	const currentView = CollectionViewType.MAIN;

	const rows = useMemo(
		() =>
			measurePerf('collection.rows.derive', () => getCollectionRows(mods), {
				totalMods: mods.modIdToModDataMap.size
			}),
		[mods]
	);
	const visibleRows = filteredRows || rows;
	const displayedCurrentRecord = getDisplayedCollectionRecord(mods, currentRecord);
	const currentViewConfig = config.viewConfigs?.[currentView];
	const sideBySideEligible = contentSize.width >= MIN_SIDE_BY_SIDE_WIDTH;
	const automaticHalfDetailsLayout: HalfDetailsLayout =
		sideBySideEligible && contentSize.width > contentSize.height * 1.45 ? 'side' : 'bottom';
	const halfDetailsLayout =
		preferredHalfDetailsLayout === 'side' && !sideBySideEligible ? 'bottom' : preferredHalfDetailsLayout || automaticHalfDetailsLayout;
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
	const handleToggleHalfLayout = useCallback(() => {
		startTransition(() => {
			setPreferredHalfDetailsLayout(halfDetailsLayout === 'side' ? 'bottom' : 'side');
		});
	}, [halfDetailsLayout]);
	const handleReloadModList = useCallback(() => {
		closeCurrentRecord();
		updateState({ loadingMods: true, forceReloadMods: true });
	}, [closeCurrentRecord, updateState]);
	const handleSaveCollection = useCallback(() => {
		if (activeCollection) {
			void saveCollection(activeCollection, true);
		}
	}, [activeCollection, saveCollection]);
	const handleSetMainColumnWidth = useCallback(
		async (column: MainColumnTitles, width: number) => {
			try {
				return await persistViewConfig(setMainCollectionColumnWidth(config, column, width), (nextConfig) =>
					updateState({ config: nextConfig })
				);
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
		[config, openNotification, updateState]
	);
	const handleSetMainColumnVisibility = useCallback(
		async (column: MainColumnTitles, visible: boolean) => {
			try {
				return await persistViewConfig(setMainCollectionColumnVisibility(config, column, visible), (nextConfig) =>
					updateState({ config: nextConfig })
				);
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
		[config, openNotification, updateState]
	);
	const handleSetMainColumnOrder = useCallback(
		async (fromColumn: MainColumnTitles, toColumn: MainColumnTitles) => {
			try {
				return await persistViewConfig(moveMainCollectionColumn(config, fromColumn, toColumn), (nextConfig) =>
					updateState({ config: nextConfig })
				);
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
		[config, openNotification, updateState]
	);
	const handleLaunchAnyway = useCallback(() => {
		setLaunchGameWithErrors(true);
		const modList = getCollectionModDataList(mods, activeCollection);
		void closeLaunchModal(modList);
	}, [activeCollection, closeLaunchModal, mods, setLaunchGameWithErrors]);
	const handleDeleteCollection = useCallback(() => {
		void deleteCollection();
	}, [deleteCollection]);

	useEffect(() => {
		if (!displayedCurrentRecord || loadingMods || currentView !== CollectionViewType.MAIN) {
			if (!prewarmAlternateDetails) {
				return;
			}

			const resetTimeout = window.setTimeout(() => {
				setPrewarmAlternateDetails(false);
			}, 0);

			return () => {
				window.clearTimeout(resetTimeout);
			};
		}

		if (prewarmAlternateDetails) {
			return;
		}

		let cancelled = false;
		const warmDetailsLayouts = () => {
			if (cancelled) {
				return;
			}

			void loadModDetailsFooter();
			setPrewarmAlternateDetails(true);
		};

		if (typeof window.requestIdleCallback === 'function') {
			const idleHandle = window.requestIdleCallback(warmDetailsLayouts, { timeout: 1000 });
			return () => {
				cancelled = true;
				window.cancelIdleCallback(idleHandle);
			};
		}

		const timeout = window.setTimeout(warmDetailsLayouts, 250);
		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [currentView, displayedCurrentRecord, loadingMods, prewarmAlternateDetails, setPrewarmAlternateDetails]);

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
			tableCommands: {
				getModDetails: handleGetModDetails,
				openSettings: openMainViewSettings,
				setColumnOrder: handleSetMainColumnOrder,
				setColumnVisibility: handleSetMainColumnVisibility,
				setColumnWidth: handleSetMainColumnWidth,
				setDisabled: handleDisableMod,
				setEnabled: handleEnableMod,
				setEnabledMods
			}
		}),
		[
			appState.activeCollection,
			appState.launchingGame,
			currentViewConfig,
			handleDisableMod,
			handleEnableMod,
			handleGetModDetails,
			handleSetMainColumnOrder,
			handleSetMainColumnWidth,
			handleSetMainColumnVisibility,
			openMainViewSettings,
			currentValidationStatus,
			madeEdits,
			rows,
			setEnabledMods,
			visibleRows
		]
	);

	const showSideBySideDetails =
		currentView === CollectionViewType.MAIN && !!displayedCurrentRecord && !bigDetails && halfDetailsLayout === 'side';
	const maxSideDetailsWidth = Math.max(360, contentSize.width - MIN_COLLECTION_TABLE_WIDTH);
	const sideDetailsWidth = showSideBySideDetails
		? Math.min(maxSideDetailsWidth, Math.max(360, Math.min(Math.round(contentSize.width * 0.38), 680)))
		: 0;
	const bottomDetailsHeight =
		currentView === CollectionViewType.MAIN && displayedCurrentRecord && !bigDetails && !showSideBySideDetails
			? Math.min(Math.max(220, Math.round(contentSize.height * 0.36)), Math.max(180, contentSize.height - MIN_COLLECTION_TABLE_HEIGHT))
			: 0;
	const showExpandedDetails = currentView === CollectionViewType.MAIN && !!displayedCurrentRecord && bigDetails;
	const showExpandedDetailsSurface = showExpandedDetails && !appState.loadingMods;
	const shouldRenderExpandedDetailsSurface = !!displayedCurrentRecord && (showExpandedDetailsSurface || prewarmAlternateDetails);
	const launchDisabled =
		appState.loadingMods || overrideGameRunning || gameRunning || modalType !== CollectionManagerModalType.NONE || appState.launchingGame;
	const validateIcon =
		currentValidationStatus === true ? (
			<CheckCircle size={16} aria-hidden="true" />
		) : currentValidationStatus === false ? (
			<XCircle size={16} aria-hidden="true" />
		) : (
			<RefreshCw className={validatingMods ? 'animate-[spin_900ms_linear_infinite]' : undefined} size={16} aria-hidden="true" />
		);
	const sharedDetailsProps = displayedCurrentRecord
		? {
				lastValidationStatus: currentValidationStatus,
				appState,
				halfLayoutMode: halfDetailsLayout,
				currentRecord: displayedCurrentRecord,
				activeTabKey: detailsActiveTabKey,
				setActiveTabKey: setDetailsActiveTabKey,
				closeFooterCallback: closeCurrentRecord,
				enableModCallback: handleEnableMod,
				disableModCallback: handleDisableMod,
				expandFooterCallback: handleExpandFooter,
				toggleHalfLayoutCallback: handleToggleHalfLayout,
				setModSubsetCallback: setModSubset,
				openNotification,
				validateCollection: handleValidateCollection,
				openModal: setModalType
			}
		: undefined;
	const detailsFallback = (
		<ViewStageLoadingFallback
			title="Loading mod details"
			detail="Preparing metadata, dependencies, and override controls for this mod."
			compact
		/>
	);
	const collectionSurfaceFallback = (
		<ViewStageLoadingFallback
			title={appState.loadingMods ? 'Loading mod inventory' : 'Loading collection table'}
			detail={
				appState.loadingMods
					? 'Refreshing installed mods, subscriptions, and validation data.'
					: 'Preparing columns, sorting, and selection controls.'
			}
			compact
		/>
	);
	const collectionSurface = appState.loadingMods ? (
		<Suspense fallback={collectionSurfaceFallback}>
			<ModLoadingViewLazy
				appState={appState}
				modLoadCompleteCallback={() => {
					collections.recalculateModData();
				}}
			/>
		</Suspense>
	) : !guidedFixActive ? (
		<Suspense fallback={collectionSurfaceFallback}>
			<Profiler id="Collection.MainTable" onRender={logProfilerRender}>
				<MainCollectionViewLazy {...collectionComponentProps} />
			</Profiler>
		</Suspense>
	) : null;
	const fullDetailsFooter = displayedCurrentRecord ? (
		<Suspense fallback={detailsFallback}>
			<Profiler id="Collection.DetailsFull" onRender={logProfilerRender}>
				<ModDetailsFooterLazy key="mod-details-full" {...sharedDetailsProps!} bigDetails />
			</Profiler>
		</Suspense>
	) : null;
	const halfDetailsFooter = displayedCurrentRecord ? (
		<Suspense fallback={detailsFallback}>
			<Profiler id="Collection.DetailsHalf" onRender={logProfilerRender}>
				<ModDetailsFooterLazy key="mod-details-half" {...sharedDetailsProps!} bigDetails={false} />
			</Profiler>
		</Suspense>
	) : null;
	const isCollectionModalOpen = modalType !== CollectionManagerModalType.NONE;
	const launchDisabledReason = appState.launchingGame
		? 'Already launching game'
		: gameRunning || overrideGameRunning
			? 'Game already running'
			: undefined;

	return (
		<div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="flex-none border-b border-border bg-surface px-5 py-3 max-[720px]:px-4">
				<CollectionManagerToolbar
					appState={appState}
					searchString={searchString || ''}
					savingCollection={savingCollection}
					onSearchChangeCallback={onSearchChange}
					madeEdits={madeEdits}
					onReloadModListCallback={handleReloadModList}
					onSearchCallback={onSearch}
					changeActiveCollectionCallback={changeActiveCollection}
					numResults={filteredRows ? filteredRows.length : appState.mods.modIdToModDataMap.size}
					newCollectionCallback={createNewCollection}
					duplicateCollectionCallback={duplicateCollection}
					renameCollectionCallback={renameCollection}
					saveCollectionCallback={handleSaveCollection}
					openViewSettingsCallback={openMainViewSettings}
					openNotification={openNotification}
					openModal={setModalType}
				/>
			</header>
			{isCollectionModalOpen ? (
				<Suspense fallback={null}>
					<CollectionManagerModalLazy
						appState={appState}
						launchAnyway={handleLaunchAnyway}
						modalType={modalType}
						launchGameWithErrors={!!launchGameWithErrors}
						currentView={currentView}
						collectionErrors={currentCollectionErrors}
						openNotification={openNotification}
						closeModal={closeModal}
						currentRecord={displayedCurrentRecord}
						deleteCollection={handleDeleteCollection}
					/>
				</Suspense>
			) : null}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<div className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">
					<div
						className={[collectionContentStageBaseClassName, showExpandedDetailsSurface ? undefined : collectionContentStageActiveClassName]
							.filter(Boolean)
							.join(' ')}
					>
						<MeasuredArea onSizeChange={setContentSize}>
							{() => {
								let actualContent = null;
								if (collectionSurface) {
									const outlet = collectionSurface;

									if (displayedCurrentRecord && currentView === CollectionViewType.MAIN && !bigDetails) {
										if (showSideBySideDetails) {
											actualContent = (
												<div className={collectionSplitLayoutBaseClassName}>
													<div key="collection" className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
														{outlet}
													</div>
													<div
														className={[
															collectionSplitPaneBaseClassName,
															'flex-[0_0_var(--collection-split-size)] animate-[splitPaneFade_140ms_ease] border-l border-[color-mix(in_srgb,var(--app-color-text-base)_8%,transparent)] motion-reduce:animate-none'
														].join(' ')}
														style={collectionSplitSizeStyle(sideDetailsWidth)}
													>
														{halfDetailsFooter}
													</div>
												</div>
											);
										} else {
											actualContent = (
												<div className={[collectionSplitLayoutBaseClassName, 'flex-col'].join(' ')}>
													<div key="collection" className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
														{outlet}
													</div>
													<div
														className={[
															collectionSplitPaneBaseClassName,
															'max-h-[var(--collection-split-size)] min-h-[var(--collection-split-size)] flex-[0_0_var(--collection-split-size)] animate-[splitPaneFade_140ms_ease] border-t border-[color-mix(in_srgb,var(--app-color-text-base)_8%,transparent)] motion-reduce:animate-none'
														].join(' ')}
														style={collectionSplitSizeStyle(bottomDetailsHeight)}
													>
														{halfDetailsFooter}
													</div>
												</div>
											);
										}
									} else {
										actualContent = (
											<div key="collection" className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
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
						<div
							className={[
								collectionContentStageBaseClassName,
								showExpandedDetailsSurface ? collectionContentStageActiveClassName : undefined
							]
								.filter(Boolean)
								.join(' ')}
						>
							{fullDetailsFooter}
						</div>
					) : null}
				</div>
			</div>
			{showExpandedDetails ? null : (
				<footer className="MainFooter">
					<div className="flex w-full items-center justify-end gap-3">
						<button
							aria-label="Validate Collection"
							className={currentValidationStatus === false ? collectionFooterDangerButtonClassName : collectionFooterButtonClassName}
							disabled={appState.loadingMods || modalType !== CollectionManagerModalType.NONE || validatingMods || appState.launchingGame}
							onClick={() => {
								handleValidateCollection();
							}}
							type="button"
						>
							{validateIcon}
							Validate Collection
						</button>
						<span title={launchDisabledReason}>
							<button
								className={collectionFooterPrimaryButtonClassName}
								disabled={launchDisabled}
								onClick={() => {
									void launchGame();
								}}
								type="button"
							>
								{appState.launchingGame ? (
									<span
										className="h-3.5 w-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
										aria-hidden="true"
									/>
								) : null}
								Launch Game
							</button>
						</span>
					</div>
				</footer>
			)}
		</div>
	);
}

export const CollectionView = memo(CollectionViewComponent);

export default function CollectionRoute() {
	return <CollectionView appState={useOutletContext<CollectionWorkspaceAppState>()} />;
}

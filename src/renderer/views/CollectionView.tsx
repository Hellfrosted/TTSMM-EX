import {
	ReactNode,
	Suspense,
	lazy,
	memo,
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent
} from 'react';
import { useOutletContext } from 'react-router-dom';
import { CollectionManagerModalType, CollectionViewProps, CollectionViewType, MainColumnTitles, ModCollection } from 'model';
import CollectionManagerToolbar from '../components/collections/CollectionManagementToolbar';
import ViewStageLoadingFallback from '../components/loading/ViewStageLoadingFallback';
import { useNotifications } from '../hooks/collections/useNotifications';
import { PerfProfiler, markPerfInteraction } from '../perf';
import { filterCollectionRowsByTags, getCollectionRowFilterTags } from '../collection-mod-row-filter';
import { getDisplayedCollectionRecord, projectCollectionRowsWithErrors } from '../collection-mod-display';
import { getCollectionLaunchCommandState } from '../collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { useViewConfigCommands } from '../view-config-command';
import { MAIN_DETAILS_OVERLAY_MIN_HEIGHT, MAIN_DETAILS_OVERLAY_MIN_WIDTH } from '../main-view-config-constants';
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

const modDetailsLoadingFallback = (
	<ViewStageLoadingFallback
		title="Loading mod details"
		detail="Preparing metadata, dependencies, and override controls for this mod."
		compact
	/>
);

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
	}, []);

	return (
		<div ref={containerRef} className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
			{children(size)}
		</div>
	);
}

function collectionOverlaySizeStyle(size: number): CSSProperties {
	return {
		'--collection-details-overlay-size': `${size}px`
	} as CSSProperties;
}

const collectionContentStageBaseClassName =
	'CollectionContentStage absolute inset-0 flex min-h-0 min-w-0 overflow-hidden contain-[layout_paint_style] transition-[opacity,visibility] duration-[140ms] motion-reduce:transition-none';
const collectionContentStageActiveClassName = 'opacity-100 visible';
const collectionContentStageInactiveClassName = 'opacity-0 invisible';
const collectionOverlayLayoutBaseClassName = 'relative flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden';
const collectionOverlayPaneBaseClassName = 'CollectionDetailsOverlayPane absolute z-20 flex min-h-0 min-w-0 overflow-hidden bg-surface';
const collectionOverlayPaneActiveClassName = 'opacity-100 translate-x-0 translate-y-0';
const collectionOverlayPaneSideClassName =
	'CollectionDetailsOverlayPane--side bottom-0 right-0 top-0 w-(--collection-details-overlay-size) border-l border-[color-mix(in_srgb,var(--app-color-text-base)_14%,transparent)]';
const collectionOverlayPaneBottomClassName =
	'CollectionDetailsOverlayPane--bottom bottom-0 left-0 right-0 h-(--collection-details-overlay-size) border-t border-[color-mix(in_srgb,var(--app-color-text-base)_14%,transparent)]';

type HalfDetailsLayout = 'bottom' | 'side';
const MIN_SIDE_BY_SIDE_WIDTH = 1120;
const MIN_COLLECTION_TABLE_WIDTH = 640;
const MIN_COLLECTION_TABLE_HEIGHT = 320;
const DETAIL_OVERLAY_KEYBOARD_STEP = 10;
const DETAIL_OVERLAY_KEYBOARD_LARGE_STEP = 40;
const DETAIL_OVERLAY_KEYBOARD_PERSIST_DELAY_MS = 180;

function clampDetailsOverlaySize(size: number, minSize: number, maxSize: number) {
	return Math.min(Math.max(minSize, maxSize), Math.max(minSize, Math.round(size)));
}

function preferredHalfDetailsLayoutReducer(_currentLayout: HalfDetailsLayout | undefined, nextLayout: HalfDetailsLayout) {
	return nextLayout;
}

interface CollectionViewRouteProps {
	appState: CollectionWorkspaceAppState;
}

function useCollectionViewController({ appState }: CollectionViewRouteProps) {
	const { openNotification } = useNotifications();
	const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
	const [preferredHalfDetailsLayout, setPreferredHalfDetailsLayout] = useReducer(preferredHalfDetailsLayoutReducer, undefined);
	const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
	const guidedFixActive = false;
	const { activeCollection, config, loadingMods, mods, updateState } = appState;

	const {
		bigDetails,
		closeCurrentRecord,
		closeModal,
		getModDetails: handleGetModDetails,
		launchGame,
		launchAnyway: handleLaunchAnyway,
		launchGameWithErrors,
		modalType,
		openMainViewSettings,
		prewarmAlternateDetails,
		setPrewarmAlternateDetails,
		collections,
		collectionWorkspaceSession,
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
		filteredRows,
		rows: baseRows,
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
	const hasUnsavedDraft = collectionWorkspaceSession.hasUnsavedDraft;
	const savingDraft = collectionWorkspaceSession.savingDraft;
	const validatingDraft = collectionWorkspaceSession.validatingDraft;

	const currentView = CollectionViewType.MAIN;

	const rows = useMemo(() => projectCollectionRowsWithErrors(baseRows, currentCollectionErrors), [baseRows, currentCollectionErrors]);
	const availableFilterTags = useMemo(() => {
		const tags = new Set<string>();
		baseRows.forEach((row) => {
			getCollectionRowFilterTags(row).forEach((tag) => tags.add(tag));
		});
		return Array.from(tags).sort((left, right) => left.localeCompare(right));
	}, [baseRows]);
	useEffect(() => {
		if (selectedFilterTags.length === 0) {
			return;
		}

		const availableTagSet = new Set(availableFilterTags);
		setSelectedFilterTags((currentTags) => {
			const retainedTags = currentTags.filter((tag) => availableTagSet.has(tag));
			return retainedTags.length === currentTags.length ? currentTags : retainedTags;
		});
	}, [availableFilterTags, selectedFilterTags.length]);
	const visibleRows = useMemo(
		() => filterCollectionRowsByTags(filteredRows || rows, selectedFilterTags),
		[filteredRows, rows, selectedFilterTags]
	);
	const visibleSelectedCount = useMemo(() => {
		const selectedModIds = new Set(activeCollection?.mods ?? []);
		return visibleRows.reduce((count, row) => count + (selectedModIds.has(row.uid) ? 1 : 0), 0);
	}, [activeCollection?.mods, visibleRows]);
	const activeFilterCount = selectedFilterTags.length + (searchString.trim().length > 0 ? 1 : 0);
	const displayedCurrentRecord = getDisplayedCollectionRecord(mods, currentRecord, currentCollectionErrors);
	const currentViewConfig = config.viewConfigs?.[currentView];
	const tableCollection = useMemo(
		() =>
			activeCollection ??
			({
				name: config.activeCollection || 'default',
				mods: []
			} satisfies ModCollection),
		[activeCollection, config.activeCollection]
	);
	const {
		setMainDetailsOverlaySize: persistMainDetailsOverlaySize,
		setMainColumnOrder: persistMainColumnOrder,
		setMainColumnVisibility: persistMainColumnVisibility,
		setMainColumnWidth: persistMainColumnWidth
	} = useViewConfigCommands({ config, openNotification, updateState });
	const [draftDetailsOverlaySize, setDraftDetailsOverlaySize] = useState<{ layout: HalfDetailsLayout; size: number } | null>(null);
	useEffect(() => {
		if (!draftDetailsOverlaySize) {
			return;
		}

		const persistedSize =
			draftDetailsOverlaySize.layout === 'side' ? currentViewConfig?.detailsOverlayWidth : currentViewConfig?.detailsOverlayHeight;
		if (persistedSize === draftDetailsOverlaySize.size) {
			setDraftDetailsOverlaySize(null);
		}
	}, [currentViewConfig?.detailsOverlayHeight, currentViewConfig?.detailsOverlayWidth, draftDetailsOverlaySize]);
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
			return persistMainColumnWidth(column, width);
		},
		[persistMainColumnWidth]
	);
	const handleSetMainColumnVisibility = useCallback(
		async (column: MainColumnTitles, visible: boolean) => {
			return persistMainColumnVisibility(column, visible);
		},
		[persistMainColumnVisibility]
	);
	const handleSetMainColumnOrder = useCallback(
		async (fromColumn: MainColumnTitles, toColumn: MainColumnTitles) => {
			return persistMainColumnOrder(fromColumn, toColumn);
		},
		[persistMainColumnOrder]
	);
	const handleResizeHalfDetails = useCallback((layout: HalfDetailsLayout, size: number) => {
		setDraftDetailsOverlaySize({ layout, size });
	}, []);
	const handleResizeHalfDetailsEnd = useCallback(
		async (layout: HalfDetailsLayout, size: number) => {
			setDraftDetailsOverlaySize({ layout, size });
			return persistMainDetailsOverlaySize(layout, size);
		},
		[persistMainDetailsOverlaySize]
	);
	const handleResetHalfDetailsSize = useCallback(
		async (layout: HalfDetailsLayout) => {
			setDraftDetailsOverlaySize(null);
			return persistMainDetailsOverlaySize(layout, undefined);
		},
		[persistMainDetailsOverlaySize]
	);
	const handleDeleteCollection = useCallback(() => {
		void deleteCollection();
	}, [deleteCollection]);

	useEffect(() => {
		if (!displayedCurrentRecord || loadingMods) {
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
	}, [displayedCurrentRecord, loadingMods, prewarmAlternateDetails, setPrewarmAlternateDetails]);

	const collectionComponentProps: CollectionViewProps = useMemo(
		() => ({
			madeEdits: hasUnsavedDraft,
			lastValidationStatus: currentValidationStatus,
			rows,
			filteredRows: visibleRows,
			height: '100%',
			width: '100%',
			detailsOpen: !!displayedCurrentRecord,
			collection: tableCollection,
			launchingGame: appState.launchingGame,
			config: currentViewConfig,
			availableTags: availableFilterTags,
			selectedTags: selectedFilterTags,
			onSelectedTagsChange: setSelectedFilterTags,
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
			appState.launchingGame,
			availableFilterTags,
			currentViewConfig,
			displayedCurrentRecord,
			handleDisableMod,
			handleEnableMod,
			handleGetModDetails,
			handleSetMainColumnOrder,
			handleSetMainColumnWidth,
			handleSetMainColumnVisibility,
			openMainViewSettings,
			currentValidationStatus,
			hasUnsavedDraft,
			rows,
			selectedFilterTags,
			setEnabledMods,
			tableCollection,
			visibleRows
		]
	);

	const showSideBySideDetails =
		currentView === CollectionViewType.MAIN && !!displayedCurrentRecord && !bigDetails && halfDetailsLayout === 'side';
	const maxSideDetailsWidth = Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, contentSize.width - MIN_COLLECTION_TABLE_WIDTH);
	const automaticSideDetailsWidth = Math.min(
		maxSideDetailsWidth,
		Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, Math.min(Math.round(contentSize.width * 0.38), 680))
	);
	const configuredSideDetailsWidth =
		draftDetailsOverlaySize?.layout === 'side'
			? draftDetailsOverlaySize.size
			: (currentViewConfig?.detailsOverlayWidth ?? automaticSideDetailsWidth);
	const sideDetailsWidth = showSideBySideDetails
		? clampDetailsOverlaySize(configuredSideDetailsWidth, MAIN_DETAILS_OVERLAY_MIN_WIDTH, maxSideDetailsWidth)
		: 0;
	const maxBottomDetailsHeight = Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, contentSize.height - MIN_COLLECTION_TABLE_HEIGHT);
	const automaticBottomDetailsHeight = Math.min(
		Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, Math.round(contentSize.height * 0.36)),
		maxBottomDetailsHeight
	);
	const configuredBottomDetailsHeight =
		draftDetailsOverlaySize?.layout === 'bottom'
			? draftDetailsOverlaySize.size
			: (currentViewConfig?.detailsOverlayHeight ?? automaticBottomDetailsHeight);
	const bottomDetailsHeight =
		currentView === CollectionViewType.MAIN && displayedCurrentRecord && !bigDetails && !showSideBySideDetails
			? clampDetailsOverlaySize(configuredBottomDetailsHeight, MAIN_DETAILS_OVERLAY_MIN_HEIGHT, maxBottomDetailsHeight)
			: 0;
	const showExpandedDetails = currentView === CollectionViewType.MAIN && !!displayedCurrentRecord && bigDetails;
	const showExpandedDetailsSurface = showExpandedDetails && !appState.loadingMods;
	const shouldRenderExpandedDetailsSurface = !!displayedCurrentRecord && (showExpandedDetailsSurface || prewarmAlternateDetails);
	const launchCommandState = getCollectionLaunchCommandState({
		launchReadiness: collectionWorkspaceSession.launchReadiness,
		modalOpen: modalType !== CollectionManagerModalType.NONE
	});
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
	const detailsFallback = modDetailsLoadingFallback;
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
			<PerfProfiler id="Collection.MainTable">
				<MainCollectionViewLazy {...collectionComponentProps} />
			</PerfProfiler>
		</Suspense>
	) : null;
	const fullDetailsFooter = displayedCurrentRecord ? (
		<Suspense fallback={detailsFallback}>
			<PerfProfiler id="Collection.DetailsFull">
				<ModDetailsFooterLazy key="mod-details-full" {...sharedDetailsProps!} bigDetails />
			</PerfProfiler>
		</Suspense>
	) : null;
	const halfDetailsFooter = displayedCurrentRecord ? (
		<Suspense fallback={detailsFallback}>
			<PerfProfiler id="Collection.DetailsHalf">
				<ModDetailsFooterLazy key="mod-details-half" {...sharedDetailsProps!} bigDetails={false} />
			</PerfProfiler>
		</Suspense>
	) : null;
	const isCollectionModalOpen = modalType !== CollectionManagerModalType.NONE;
	const launchDisabledReason = launchCommandState.reason;

	return {
		appState,
		bigDetails,
		bottomDetailsHeight,
		changeActiveCollection,
		closeModal,
		collectionComponentProps,
		collectionSurface,
		collectionSurfaceFallback,
		createNewCollection,
		currentCollectionErrors,
		currentView,
		currentValidationStatus,
		displayedCurrentRecord,
		duplicateCollection,
		fullDetailsFooter,
		handleCloseDetails: closeCurrentRecord,
		handleDeleteCollection,
		handleLaunchAnyway,
		handleReloadModList,
		handleResetHalfDetailsSize,
		handleResizeHalfDetails,
		handleResizeHalfDetailsEnd,
		handleSaveCollection,
		handleValidateCollection,
		hasUnsavedDraft,
		halfDetailsFooter,
		isCollectionModalOpen,
		launchCommandState,
		launchDisabledReason,
		launchReady: collectionWorkspaceSession.launchReadiness.ready,
		launchGame,
		launchGameWithErrors,
		modalType,
		onSearch,
		onSearchChange,
		openMainViewSettings,
		openNotification,
		renameCollection,
		saveCollection,
		searchString,
		setContentSize,
		setModalType,
		showExpandedDetailsSurface,
		showHalfDetails: showSideBySideDetails || bottomDetailsHeight > 0,
		showSideBySideDetails,
		sideDetailsWidth,
		maxBottomDetailsHeight,
		maxSideDetailsWidth,
		shouldRenderExpandedDetailsSurface,
		savingDraft,
		validatingDraft,
		visibleRows,
		visibleSelectedCount,
		activeFilterCount
	};
}

function DetailsOverlayResizeHandle({
	layout,
	maxSize,
	minSize,
	onReset,
	onResize,
	onResizeEnd,
	size
}: {
	layout: HalfDetailsLayout;
	maxSize: number;
	minSize: number;
	onReset: (layout: HalfDetailsLayout) => void;
	onResize: (layout: HalfDetailsLayout, size: number) => void;
	onResizeEnd: (layout: HalfDetailsLayout, size: number) => void;
	size: number;
}) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const keyboardPersistTimeoutRef = useRef<number | undefined>(undefined);
	const sizeRef = useRef(size);
	const handleRef = useRef<HTMLButtonElement | null>(null);
	const isSideLayout = layout === 'side';
	const orientation = isSideLayout ? 'vertical' : 'horizontal';
	const cursor = isSideLayout ? 'col-resize' : 'row-resize';
	const label = isSideLayout ? 'Resize side details panel' : 'Resize bottom details panel';

	const syncHandleValue = useCallback(
		(nextSize: number) => {
			const clampedSize = clampDetailsOverlaySize(nextSize, minSize, maxSize);
			sizeRef.current = clampedSize;
			const handle = handleRef.current;
			if (!handle) {
				return;
			}

			handle.setAttribute('aria-valuenow', `${clampedSize}`);
			handle.setAttribute('aria-valuetext', `${clampedSize}px`);
			handle.setAttribute('aria-valuemax', `${Math.max(minSize, maxSize)}`);
		},
		[maxSize, minSize]
	);

	useEffect(() => {
		syncHandleValue(size);
	}, [size, syncHandleValue]);

	useEffect(() => {
		return () => {
			cleanupRef.current?.();
			if (keyboardPersistTimeoutRef.current !== undefined) {
				window.clearTimeout(keyboardPersistTimeoutRef.current);
			}
		};
	}, []);

	const startResize = useCallback(
		(startX: number, startY: number) => {
			const startSize = clampDetailsOverlaySize(sizeRef.current || size, minSize, maxSize);
			let nextSize = startSize;
			const previousBodyCssText = document.body.style.cssText;
			markPerfInteraction('collection.detailsOverlayResize.start', {
				layout,
				size: startSize
			});

			const updateSize = (clientX: number, clientY: number) => {
				const delta = isSideLayout ? startX - clientX : startY - clientY;
				nextSize = clampDetailsOverlaySize(startSize + delta, minSize, maxSize);
				syncHandleValue(nextSize);
				onResize(layout, nextSize);
			};

			const stopResize = () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				document.body.style.cssText = previousBodyCssText;
				cleanupRef.current = null;
				markPerfInteraction('collection.detailsOverlayResize.end', {
					layout,
					size: nextSize
				});
				onResizeEnd(layout, nextSize);
			};

			const handleMouseMove = (event: MouseEvent) => {
				updateSize(event.clientX, event.clientY);
			};

			const handleMouseUp = () => {
				stopResize();
			};

			document.body.style.cssText = `${previousBodyCssText};cursor: ${cursor}; user-select: none;`;
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			cleanupRef.current = stopResize;
		},
		[cursor, isSideLayout, layout, maxSize, minSize, onResize, onResizeEnd, size, syncHandleValue]
	);

	const handleMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			startResize(event.clientX, event.clientY);
		},
		[startResize]
	);

	const handleDoubleClick = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			markPerfInteraction('collection.detailsOverlayResize.reset', { layout });
			onReset(layout);
		},
		[layout, onReset]
	);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>) => {
			let nextSize: number | undefined;
			const step = event.shiftKey ? DETAIL_OVERLAY_KEYBOARD_LARGE_STEP : DETAIL_OVERLAY_KEYBOARD_STEP;

			if (isSideLayout) {
				if (event.key === 'ArrowLeft') {
					nextSize = sizeRef.current + step;
				} else if (event.key === 'ArrowRight') {
					nextSize = sizeRef.current - step;
				}
			} else if (event.key === 'ArrowUp') {
				nextSize = sizeRef.current + step;
			} else if (event.key === 'ArrowDown') {
				nextSize = sizeRef.current - step;
			}

			if (event.key === 'Home') {
				nextSize = minSize;
			} else if (event.key === 'End') {
				nextSize = maxSize;
			}

			if (typeof nextSize !== 'number') {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			const clampedSize = clampDetailsOverlaySize(nextSize, minSize, maxSize);
			markPerfInteraction('collection.detailsOverlayResize.keyboard', {
				layout,
				size: clampedSize
			});
			syncHandleValue(clampedSize);
			onResize(layout, clampedSize);
			if (keyboardPersistTimeoutRef.current !== undefined) {
				window.clearTimeout(keyboardPersistTimeoutRef.current);
			}
			keyboardPersistTimeoutRef.current = window.setTimeout(() => {
				keyboardPersistTimeoutRef.current = undefined;
				onResizeEnd(layout, clampedSize);
			}, DETAIL_OVERLAY_KEYBOARD_PERSIST_DELAY_MS);
		},
		[isSideLayout, layout, maxSize, minSize, onResize, onResizeEnd, syncHandleValue]
	);

	return (
		<button
			type="button"
			ref={handleRef}
			className={`CollectionDetailsOverlayResizeHandle CollectionDetailsOverlayResizeHandle--${layout}`}
			role="separator"
			aria-label={label}
			aria-orientation={orientation}
			aria-valuemin={minSize}
			aria-valuenow={size}
			aria-valuemax={Math.max(minSize, maxSize)}
			aria-valuetext={`${size}px`}
			title={`${label}. Double-click to reset.`}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
			onMouseDown={handleMouseDown}
		/>
	);
}

function CollectionContentStage({
	collectionSurface,
	displayedCurrentRecord,
	halfDetailsFooter,
	showHalfDetails,
	showExpandedDetailsSurface,
	showSideBySideDetails,
	bottomDetailsHeight,
	maxBottomDetailsHeight,
	maxSideDetailsWidth,
	onCloseDetails,
	onResetHalfDetailsSize,
	onResizeHalfDetails,
	onResizeHalfDetailsEnd,
	sideDetailsWidth,
	setContentSize
}: {
	collectionSurface: ReactNode;
	displayedCurrentRecord?: unknown;
	halfDetailsFooter: ReactNode;
	showHalfDetails: boolean;
	showExpandedDetailsSurface: boolean;
	showSideBySideDetails: boolean;
	bottomDetailsHeight: number;
	maxBottomDetailsHeight: number;
	maxSideDetailsWidth: number;
	onCloseDetails: () => void;
	onResetHalfDetailsSize: (layout: HalfDetailsLayout) => void;
	onResizeHalfDetails: (layout: HalfDetailsLayout, size: number) => void;
	onResizeHalfDetailsEnd: (layout: HalfDetailsLayout, size: number) => void;
	sideDetailsWidth: number;
	setContentSize: (size: { width: number; height: number }) => void;
}) {
	return (
		<div
			className={[
				collectionContentStageBaseClassName,
				showExpandedDetailsSurface ? collectionContentStageInactiveClassName : collectionContentStageActiveClassName
			]
				.filter(Boolean)
				.join(' ')}
			style={{ pointerEvents: showExpandedDetailsSurface ? 'none' : 'auto' }}
		>
			<MeasuredArea onSizeChange={setContentSize}>
				{() => {
					let actualContent = null;
					if (collectionSurface) {
						const outlet = collectionSurface;
						let detailsPane: ReactNode = null;

						if (displayedCurrentRecord && showHalfDetails) {
							const layout = showSideBySideDetails ? 'side' : 'bottom';
							const overlaySize = showSideBySideDetails ? sideDetailsWidth : bottomDetailsHeight;
							const overlayMaxSize = showSideBySideDetails ? maxSideDetailsWidth : maxBottomDetailsHeight;
							if (showSideBySideDetails) {
								detailsPane = (
									// biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape closes this transient details region after child controls can handle it.
									<div
										aria-label="Collection details"
										className={[
											collectionOverlayPaneBaseClassName,
											collectionOverlayPaneActiveClassName,
											collectionOverlayPaneSideClassName
										].join(' ')}
										role="region"
										style={collectionOverlaySizeStyle(overlaySize)}
										onKeyDown={(event) => {
											if (event.key === 'Escape' && !event.defaultPrevented) {
												event.preventDefault();
												event.stopPropagation();
												onCloseDetails();
											}
										}}
									>
										<DetailsOverlayResizeHandle
											layout={layout}
											maxSize={overlayMaxSize}
											minSize={MAIN_DETAILS_OVERLAY_MIN_WIDTH}
											size={overlaySize}
											onReset={onResetHalfDetailsSize}
											onResize={onResizeHalfDetails}
											onResizeEnd={onResizeHalfDetailsEnd}
										/>
										{halfDetailsFooter}
									</div>
								);
							} else {
								detailsPane = (
									// biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape closes this transient details region after child controls can handle it.
									<div
										aria-label="Collection details"
										className={[
											collectionOverlayPaneBaseClassName,
											collectionOverlayPaneActiveClassName,
											collectionOverlayPaneBottomClassName
										].join(' ')}
										role="region"
										style={collectionOverlaySizeStyle(overlaySize)}
										onKeyDown={(event) => {
											if (event.key === 'Escape' && !event.defaultPrevented) {
												event.preventDefault();
												event.stopPropagation();
												onCloseDetails();
											}
										}}
									>
										<DetailsOverlayResizeHandle
											layout={layout}
											maxSize={overlayMaxSize}
											minSize={MAIN_DETAILS_OVERLAY_MIN_HEIGHT}
											size={overlaySize}
											onReset={onResetHalfDetailsSize}
											onResize={onResizeHalfDetails}
											onResizeEnd={onResizeHalfDetailsEnd}
										/>
										{halfDetailsFooter}
									</div>
								);
							}
						}

						actualContent = (
							<div className={collectionOverlayLayoutBaseClassName}>
								<div key="collection" className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
									{outlet}
								</div>
								{detailsPane}
							</div>
						);
					}

					return actualContent || <></>;
				}}
			</MeasuredArea>
		</div>
	);
}

function ExpandedDetailsStage({
	fullDetailsFooter,
	shouldRenderExpandedDetailsSurface,
	showExpandedDetailsSurface
}: {
	fullDetailsFooter: ReactNode;
	shouldRenderExpandedDetailsSurface: boolean;
	showExpandedDetailsSurface: boolean;
}) {
	if (!shouldRenderExpandedDetailsSurface) {
		return null;
	}

	return (
		<div
			className={[
				collectionContentStageBaseClassName,
				showExpandedDetailsSurface ? collectionContentStageActiveClassName : collectionContentStageInactiveClassName
			]
				.filter(Boolean)
				.join(' ')}
			style={{ pointerEvents: showExpandedDetailsSurface ? 'auto' : 'none' }}
		>
			{fullDetailsFooter}
		</div>
	);
}

function CollectionViewComponent(props: CollectionViewRouteProps) {
	const {
		appState,
		bottomDetailsHeight,
		changeActiveCollection,
		closeModal,
		collectionSurface,
		createNewCollection,
		currentCollectionErrors,
		currentView,
		currentValidationStatus,
		displayedCurrentRecord,
		duplicateCollection,
		fullDetailsFooter,
		handleCloseDetails,
		handleDeleteCollection,
		handleLaunchAnyway,
		handleReloadModList,
		handleResetHalfDetailsSize,
		handleResizeHalfDetails,
		handleResizeHalfDetailsEnd,
		handleSaveCollection,
		handleValidateCollection,
		hasUnsavedDraft,
		halfDetailsFooter,
		isCollectionModalOpen,
		launchCommandState,
		launchDisabledReason,
		launchReady,
		launchGame,
		launchGameWithErrors,
		modalType,
		onSearch,
		onSearchChange,
		openMainViewSettings,
		openNotification,
		renameCollection,
		searchString,
		setContentSize,
		setModalType,
		showExpandedDetailsSurface,
		showHalfDetails,
		showSideBySideDetails,
		sideDetailsWidth,
		maxBottomDetailsHeight,
		maxSideDetailsWidth,
		shouldRenderExpandedDetailsSurface,
		savingDraft,
		validatingDraft,
		visibleRows,
		visibleSelectedCount,
		activeFilterCount
	} = useCollectionViewController(props);

	return (
		<div className="CollectionViewLayout flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="WorkspaceHeader CollectionWorkspaceHeader flex h-auto flex-none flex-col leading-[1.4]">
				<CollectionManagerToolbar
					appState={appState}
					searchString={searchString || ''}
					savingCollection={savingDraft}
					onSearchChangeCallback={onSearchChange}
					madeEdits={hasUnsavedDraft}
					currentValidationStatus={currentValidationStatus}
					validatingCollection={validatingDraft}
					launchingGame={appState.launchingGame}
					launchGameDisabled={launchCommandState.disabled}
					launchGameDisabledReason={launchDisabledReason}
					launchReady={launchReady}
					onReloadModListCallback={handleReloadModList}
					validateCollectionCallback={handleValidateCollection}
					launchGameCallback={() => {
						void launchGame();
					}}
					onSearchCallback={onSearch}
					changeActiveCollectionCallback={changeActiveCollection}
					numResults={visibleRows.length}
					numSelectedResults={visibleSelectedCount}
					activeFilterCount={activeFilterCount}
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
					<CollectionContentStage
						bottomDetailsHeight={bottomDetailsHeight}
						collectionSurface={collectionSurface}
						displayedCurrentRecord={displayedCurrentRecord}
						halfDetailsFooter={halfDetailsFooter}
						maxBottomDetailsHeight={maxBottomDetailsHeight}
						maxSideDetailsWidth={maxSideDetailsWidth}
						onCloseDetails={handleCloseDetails}
						onResetHalfDetailsSize={handleResetHalfDetailsSize}
						onResizeHalfDetails={handleResizeHalfDetails}
						onResizeHalfDetailsEnd={handleResizeHalfDetailsEnd}
						setContentSize={setContentSize}
						showExpandedDetailsSurface={showExpandedDetailsSurface}
						showHalfDetails={showHalfDetails}
						showSideBySideDetails={showSideBySideDetails}
						sideDetailsWidth={sideDetailsWidth}
					/>
					<ExpandedDetailsStage
						fullDetailsFooter={fullDetailsFooter}
						shouldRenderExpandedDetailsSurface={shouldRenderExpandedDetailsSurface}
						showExpandedDetailsSurface={showExpandedDetailsSurface}
					/>
				</div>
			</div>
		</div>
	);
}

export const CollectionView = memo(CollectionViewComponent);

export default function CollectionRoute() {
	return <CollectionView appState={useOutletContext<CollectionWorkspaceAppState>()} />;
}

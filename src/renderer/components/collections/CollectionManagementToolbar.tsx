import { Suspense, lazy, memo, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CollectionManagerModalType, NotificationProps } from 'model';
import {
	CheckCircle,
	ChevronDown,
	Copy,
	Edit3,
	FileJson,
	Play,
	Plus,
	RefreshCw,
	Save,
	Search,
	Settings2,
	Trash2,
	X,
	XCircle
} from 'lucide-react';
import type { CollectionNamingModalType } from 'renderer/collection-form-validation';
import { DesktopButton, DesktopIconButton, DesktopInput, DesktopSelect, DesktopToolbarButton } from 'renderer/components/DesktopControls';
import { desktopControlFocusClassName, joinClassNames } from 'renderer/components/desktop-control-classes';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

const CollectionNamingModalLazy = lazy(() => import('./CollectionNamingModal'));

const toolbarRowClassName = 'flex min-w-0 items-center gap-2.5 max-[760px]:flex-wrap';
const toolbarLeadingControlClassName =
	'min-w-70 max-w-140 flex-[0_1_35rem] max-[760px]:min-w-0 max-[760px]:max-w-none max-[760px]:basis-full';
const toolbarActionGroupClassName = 'inline-flex shrink-0 flex-wrap items-center gap-2 max-[760px]:w-full max-[760px]:[&>button]:flex-1';
const toolbarPrimaryActionGroupClassName = 'ml-auto inline-flex shrink-0 flex-wrap items-center gap-3 max-[760px]:ml-0 max-[760px]:w-full';
const toolbarDraftActionGroupClassName =
	'inline-flex shrink-0 flex-wrap items-center gap-2 max-[760px]:flex-1 max-[760px]:[&>button]:flex-1';
const toolbarLaunchActionClassName = 'min-w-34 max-[1100px]:min-w-control max-[1100px]:w-control max-[1100px]:px-0 max-[760px]:flex-1';
const toolbarMenuButtonClassName =
	'ToolbarMenuButton inline-flex cursor-pointer items-center justify-center gap-2 px-3 font-[650] max-[760px]:flex-1';
const toolbarMenuClassName =
	'ToolbarMenuSurface absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-56 flex-col rounded-sm border border-border bg-surface-elevated p-1.5 shadow-[0_8px_18px_color-mix(in_srgb,var(--app-color-background)_76%,transparent)]';
const toolbarMenuItemClassName = joinClassNames(
	'flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2.5 text-left font-[650] text-text transition-[background-color,color,opacity] duration-140 ease-out enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none',
	desktopControlFocusClassName
);

interface CollectionManagementToolbarProps {
	madeEdits: boolean;
	searchString: string;
	appState: Pick<CollectionWorkspaceAppState, 'activeCollection' | 'allCollectionNames' | 'loadingMods'>;
	savingCollection?: boolean;
	validatingCollection?: boolean;
	launchingGame?: boolean;
	currentValidationStatus?: boolean;
	launchReady?: boolean;
	launchGameDisabled?: boolean;
	launchGameDisabledReason?: string;
	numResults?: number;
	numSelectedResults?: number;
	activeFilterCount?: number;
	onReloadModListCallback: () => void;
	validateCollectionCallback?: () => void;
	launchGameCallback?: () => void;
	openViewSettingsCallback: () => void;
	onSearchCallback: (search: string) => void;
	onSearchChangeCallback: (search: string) => void;
	saveCollectionCallback: () => void;
	changeActiveCollectionCallback: (name: string) => void;
	newCollectionCallback: (name: string) => void;
	duplicateCollectionCallback: (name: string) => void;
	renameCollectionCallback: (name: string) => void;
	openNotification: (props: NotificationProps, type?: 'info' | 'error' | 'success' | 'warn') => void;
	openModal: (modalType: CollectionManagerModalType) => void;
}

function formatModCount(count: number) {
	return `${count} mod${count === 1 ? '' : 's'}`;
}

function CollectionNamingDialog({
	activeCollectionName,
	allCollectionNames,
	closeModal,
	duplicateCollectionCallback,
	initialCollectionName,
	modalType,
	newCollectionCallback,
	renameCollectionCallback,
	savingCollection
}: {
	activeCollectionName?: string;
	allCollectionNames: Set<string>;
	closeModal: () => void;
	duplicateCollectionCallback: (name: string) => void;
	initialCollectionName: string;
	modalType?: CollectionNamingModalType;
	newCollectionCallback: (name: string) => void;
	renameCollectionCallback: (name: string) => void;
	savingCollection?: boolean;
}) {
	if (!modalType) {
		return null;
	}

	return (
		<Suspense fallback={null}>
			<CollectionNamingModalLazy
				activeCollectionName={activeCollectionName}
				allCollectionNames={allCollectionNames}
				modalType={modalType}
				initialName={initialCollectionName}
				savingCollection={savingCollection}
				closeModal={closeModal}
				newCollectionCallback={newCollectionCallback}
				duplicateCollectionCallback={duplicateCollectionCallback}
				renameCollectionCallback={renameCollectionCallback}
			/>
		</Suspense>
	);
}

function CollectionSearchControls({
	disabledFeatures,
	onSearchCallback,
	onSearchChangeCallback,
	resultSummaryId,
	searchString
}: {
	disabledFeatures: boolean;
	onSearchCallback: (search: string) => void;
	onSearchChangeCallback: (search: string) => void;
	resultSummaryId?: string;
	searchString: string;
}) {
	return (
		<div className={`relative flex items-center ${toolbarLeadingControlClassName}`}>
			<Search className="pointer-events-none absolute left-3 text-text-muted" size={16} aria-hidden="true" />
			<DesktopInput
				className="w-full min-w-0 pl-9.5 pr-19 focus-visible:relative focus-visible:z-1"
				aria-label="Search mods by name, ID, author, or tag"
				aria-describedby={resultSummaryId}
				placeholder="Search mods by name, ID, author, or tag"
				type="search"
				autoComplete="off"
				spellCheck={false}
				onChange={(event) => {
					onSearchChangeCallback(event.target.value);
				}}
				value={searchString}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						onSearchCallback(searchString);
					}
				}}
				disabled={disabledFeatures}
			/>
			{searchString ? (
				<DesktopIconButton
					aria-label="Clear search"
					className="absolute right-[calc(var(--app-control-height)-1px)]"
					disabled={disabledFeatures}
					onClick={() => {
						onSearchChangeCallback('');
						onSearchCallback('');
					}}
				>
					<X size={16} aria-hidden="true" />
				</DesktopIconButton>
			) : null}
			<DesktopIconButton
				aria-label="Search"
				className="absolute right-1"
				disabled={disabledFeatures}
				onClick={() => {
					onSearchCallback(searchString);
				}}
			>
				<Search size={16} aria-hidden="true" />
			</DesktopIconButton>
		</div>
	);
}

type ToolbarMenuAction = {
	danger?: boolean;
	disabled?: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
};

function ToolbarMenu({ actions, disabled, label }: { actions: ToolbarMenuAction[]; disabled: boolean; label: string }) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const menuId = `${label.toLowerCase().replace(/\s+/g, '-')}-toolbar-menu`;

	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const getMenuItems = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
		const focusMenuButton = () => {
			rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
		};
		const focusMenuItem = (direction: 1 | -1 | 'first' | 'last') => {
			const menuItems = getMenuItems();
			if (menuItems.length === 0) {
				return;
			}

			if (direction === 'first') {
				menuItems[0].focus();
				return;
			}

			if (direction === 'last') {
				menuItems[menuItems.length - 1].focus();
				return;
			}

			const activeIndex = menuItems.findIndex((item) => item === document.activeElement);
			const nextIndex = activeIndex < 0 ? 0 : (activeIndex + direction + menuItems.length) % menuItems.length;
			menuItems[nextIndex].focus();
		};
		const focusFirstMenuItem = window.requestAnimationFrame(() => {
			focusMenuItem('first');
		});
		const closeOnOutsideClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node) || rootRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
		};
		const handleMenuKeyboard = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setOpen(false);
				focusMenuButton();
				return;
			}

			if (!menuRef.current?.contains(document.activeElement)) {
				return;
			}

			if (event.key === 'ArrowDown') {
				event.preventDefault();
				focusMenuItem(1);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				focusMenuItem(-1);
			} else if (event.key === 'Home') {
				event.preventDefault();
				focusMenuItem('first');
			} else if (event.key === 'End') {
				event.preventDefault();
				focusMenuItem('last');
			} else if (event.key === 'Tab') {
				setOpen(false);
			}
		};

		window.addEventListener('mousedown', closeOnOutsideClick);
		window.addEventListener('keydown', handleMenuKeyboard);
		return () => {
			window.cancelAnimationFrame(focusFirstMenuItem);
			window.removeEventListener('mousedown', closeOnOutsideClick);
			window.removeEventListener('keydown', handleMenuKeyboard);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative inline-flex max-[760px]:flex-1">
			<DesktopButton
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-haspopup="menu"
				className={toolbarMenuButtonClassName}
				disabled={disabled}
				icon={<ChevronDown size={16} aria-hidden="true" />}
				onClick={() => {
					setOpen((current) => !current);
				}}
			>
				{label}
			</DesktopButton>
			{open ? (
				<div ref={menuRef} id={menuId} className={toolbarMenuClassName} role="menu" aria-label={`${label} actions`}>
					{actions.map((action) => (
						<button
							key={action.label}
							type="button"
							className={joinClassNames(toolbarMenuItemClassName, action.danger ? 'text-error' : undefined)}
							disabled={action.disabled}
							role="menuitem"
							onClick={() => {
								action.onClick();
								setOpen(false);
							}}
						>
							<span className="inline-flex shrink-0">{action.icon}</span>
							<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{action.label}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function PrimaryCollectionControls({
	currentValidationStatus,
	disabledFeatures,
	launchReady,
	launchGameCallback,
	launchGameDisabled,
	launchGameDisabledReason,
	launchingGame,
	madeEdits,
	saveCollectionCallback,
	savingCollection,
	validateCollectionCallback,
	validatingCollection
}: Pick<
	CollectionManagementToolbarProps,
	| 'currentValidationStatus'
	| 'launchGameCallback'
	| 'launchGameDisabled'
	| 'launchGameDisabledReason'
	| 'launchReady'
	| 'launchingGame'
	| 'madeEdits'
	| 'saveCollectionCallback'
	| 'savingCollection'
	| 'validateCollectionCallback'
	| 'validatingCollection'
> & {
	disabledFeatures: boolean;
}) {
	const validateIcon =
		currentValidationStatus === true ? (
			<CheckCircle size={16} aria-hidden="true" />
		) : currentValidationStatus === false ? (
			<XCircle size={16} aria-hidden="true" />
		) : (
			<RefreshCw className={validatingCollection ? 'animate-[spin_900ms_linear_infinite]' : undefined} size={16} aria-hidden="true" />
		);
	const [launchReadyPulse, setLaunchReadyPulse] = useState(false);
	const validationRequestedRef = useRef(false);
	const wasValidatingCollectionRef = useRef(!!validatingCollection);
	const validateLabel = launchReady ? 'Collection Ready' : 'Validate Collection';
	const readyTitle = launchReady ? 'Collection is validated and ready to launch' : 'Validate collection';

	useEffect(() => {
		const wasValidatingCollection = wasValidatingCollectionRef.current;
		wasValidatingCollectionRef.current = !!validatingCollection;
		if (!wasValidatingCollection || validatingCollection) {
			return undefined;
		}

		const shouldPulse = validationRequestedRef.current && !!launchReady;
		validationRequestedRef.current = false;
		if (!shouldPulse) {
			setLaunchReadyPulse(false);
			return undefined;
		}

		setLaunchReadyPulse(true);
		const timeoutId = window.setTimeout(() => {
			setLaunchReadyPulse(false);
		}, 620);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [launchReady, validatingCollection]);

	return (
		<div className={toolbarPrimaryActionGroupClassName} role="group" aria-label="Primary collection actions">
			<div className={toolbarDraftActionGroupClassName} role="group" aria-label="Draft and validation actions">
				<DesktopToolbarButton
					aria-label="Save Collection"
					title="Save collection"
					icon={<Save size={16} aria-hidden="true" />}
					loading={savingCollection}
					variant={madeEdits ? 'primary' : 'default'}
					onClick={saveCollectionCallback}
					disabled={disabledFeatures || !madeEdits}
				>
					Save Collection
				</DesktopToolbarButton>
				<DesktopToolbarButton
					aria-label={validateLabel}
					title={readyTitle}
					icon={validateIcon}
					danger={currentValidationStatus === false}
					onClick={() => {
						validationRequestedRef.current = true;
						validateCollectionCallback?.();
					}}
					disabled={disabledFeatures || validatingCollection || launchingGame || !validateCollectionCallback}
				>
					{launchReady ? 'Ready' : 'Validate Collection'}
				</DesktopToolbarButton>
			</div>
			<DesktopToolbarButton
				aria-label="Launch Game"
				title={launchGameDisabledReason || 'Launch game'}
				className={toolbarLaunchActionClassName}
				data-ready-pulse={launchReadyPulse ? 'true' : undefined}
				icon={<Play size={16} aria-hidden="true" />}
				loading={launchingGame}
				variant="primary"
				onClick={() => {
					launchGameCallback?.();
				}}
				disabled={disabledFeatures || !!launchGameDisabled || !launchGameCallback}
			>
				Launch Game
			</DesktopToolbarButton>
		</div>
	);
}

function CollectionSelector({
	activeCollectionName,
	changeActiveCollectionCallback,
	disabledFeatures,
	sortedCollectionNames
}: {
	activeCollectionName?: string;
	changeActiveCollectionCallback: (name: string) => void;
	disabledFeatures: boolean;
	sortedCollectionNames: string[];
}) {
	return (
		<DesktopSelect
			className={`${toolbarLeadingControlClassName} px-2.75`}
			value={activeCollectionName || ''}
			aria-label="Select the active collection"
			onChange={(event) => {
				changeActiveCollectionCallback(event.target.value);
			}}
			disabled={disabledFeatures}
		>
			{activeCollectionName ? null : <option value="">No collection selected</option>}
			{sortedCollectionNames.map((name: string) => {
				return (
					<option key={name} value={name}>
						{name}
					</option>
				);
			})}
		</DesktopSelect>
	);
}

function ToolbarSecondaryMenus({
	disabledFeatures,
	handleCopyCollection,
	onReloadModListCallback,
	openCollectionModal,
	openModal,
	openViewSettingsCallback
}: {
	disabledFeatures: boolean;
	handleCopyCollection: () => Promise<void>;
	onReloadModListCallback: () => void;
	openCollectionModal: (nextModalType: CollectionNamingModalType) => void;
	openModal: (modalType: CollectionManagerModalType) => void;
	openViewSettingsCallback: () => void;
}) {
	const collectionActions: ToolbarMenuAction[] = [
		{
			icon: <Edit3 size={16} aria-hidden="true" />,
			label: 'Rename collection',
			onClick: () => {
				openCollectionModal('rename-collection');
			}
		},
		{
			icon: <Plus size={16} aria-hidden="true" />,
			label: 'New collection',
			onClick: () => {
				openCollectionModal('new-collection');
			}
		},
		{
			icon: <Copy size={16} aria-hidden="true" />,
			label: 'Duplicate collection',
			onClick: () => {
				openCollectionModal('duplicate-collection');
			}
		},
		{
			icon: <FileJson size={16} aria-hidden="true" />,
			label: 'Copy JSON export',
			onClick: () => {
				void handleCopyCollection();
			}
		},
		{
			danger: true,
			icon: <Trash2 size={16} aria-hidden="true" />,
			label: 'Delete collection',
			onClick: () => {
				openModal(CollectionManagerModalType.WARN_DELETE);
			}
		}
	];
	return (
		<div className={`ml-auto ${toolbarActionGroupClassName} max-[760px]:ml-0`} role="group" aria-label="More collection and table actions">
			<ToolbarMenu actions={collectionActions} disabled={disabledFeatures} label="Collection" />
			<DesktopToolbarButton
				aria-label="Reload mods"
				title="Reload mods"
				icon={<RefreshCw size={16} aria-hidden="true" />}
				disabled={disabledFeatures}
				onClick={onReloadModListCallback}
			>
				Reload Mods
			</DesktopToolbarButton>
			<DesktopToolbarButton
				aria-label="Table Settings"
				title="Table settings"
				icon={<Settings2 size={16} aria-hidden="true" />}
				disabled={disabledFeatures}
				onClick={openViewSettingsCallback}
			>
				Table Settings
			</DesktopToolbarButton>
		</div>
	);
}

function CollectionManagementToolbarComponent({
	openModal,
	saveCollectionCallback,
	appState,
	changeActiveCollectionCallback,
	savingCollection,
	validatingCollection,
	launchingGame,
	currentValidationStatus,
	launchGameDisabled,
	launchGameDisabledReason,
	launchReady,
	numResults,
	numSelectedResults,
	activeFilterCount,
	onSearchCallback,
	onSearchChangeCallback,
	validateCollectionCallback,
	launchGameCallback,
	searchString,
	madeEdits,
	openViewSettingsCallback,
	onReloadModListCallback,
	openNotification,
	newCollectionCallback,
	duplicateCollectionCallback,
	renameCollectionCallback
}: CollectionManagementToolbarProps) {
	const [modalType, setModalType] = useState<CollectionNamingModalType>();
	const [initialCollectionName, setInitialCollectionName] = useState('');
	const disabledFeatures = !!savingCollection || !!appState.loadingMods || !!modalType;
	const { activeCollection } = appState;
	const sortedCollectionNames = Array.from(appState.allCollectionNames).sort();
	const resultSummaryId = useId();
	const shownSummary = numResults === undefined ? undefined : `${formatModCount(numResults)} shown`;
	const selectedSummary = numSelectedResults === undefined ? undefined : `${formatModCount(numSelectedResults)} enabled in this view`;
	const filterSummary =
		activeFilterCount && activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : undefined;
	const resultSummary = [shownSummary, selectedSummary, filterSummary].filter(Boolean).join(', ');

	const openCollectionModal = (nextModalType: CollectionNamingModalType) => {
		const nextText =
			nextModalType === 'rename-collection'
				? activeCollection?.name || ''
				: nextModalType === 'duplicate-collection' && activeCollection
					? `${activeCollection.name} copy`
					: '';

		setModalType(nextModalType);
		setInitialCollectionName(nextText);
	};

	const handleCopyCollection = async () => {
		if (!activeCollection) {
			openNotification(
				{
					message: 'No active collection selected',
					description: 'Choose a collection before copying its JSON export.',
					placement: 'topRight',
					duration: 2
				},
				'warn'
			);
			return;
		}

		if (!navigator.clipboard?.writeText) {
			openNotification(
				{
					message: 'Unable to copy collection',
					description: 'Clipboard access is unavailable in this session.',
					placement: 'topRight',
					duration: 2
				},
				'error'
			);
			return;
		}

		try {
			await navigator.clipboard.writeText(JSON.stringify(activeCollection, null, '\t'));
			openNotification(
				{
					message: 'Collection copied',
					description: `${activeCollection.name} was copied as a formatted JSON export.`,
					placement: 'topRight',
					duration: 1
				},
				'success'
			);
		} catch {
			openNotification(
				{
					message: 'Unable to copy collection',
					description: 'The collection export could not be written to the system clipboard.',
					placement: 'topRight',
					duration: 2
				},
				'error'
			);
		}
	};
	return (
		<div id="mod-collection-toolbar" className="flex flex-col gap-2.5 max-[760px]:gap-2">
			<CollectionNamingDialog
				activeCollectionName={activeCollection?.name}
				allCollectionNames={appState.allCollectionNames}
				modalType={modalType}
				initialCollectionName={initialCollectionName}
				savingCollection={savingCollection}
				closeModal={() => {
					setModalType(undefined);
					setInitialCollectionName('');
				}}
				newCollectionCallback={newCollectionCallback}
				duplicateCollectionCallback={duplicateCollectionCallback}
				renameCollectionCallback={renameCollectionCallback}
			/>
			<div className={toolbarRowClassName}>
				<CollectionSearchControls
					disabledFeatures={disabledFeatures}
					onSearchCallback={onSearchCallback}
					onSearchChangeCallback={onSearchChangeCallback}
					resultSummaryId={resultSummary ? resultSummaryId : undefined}
					searchString={searchString}
				/>
				<PrimaryCollectionControls
					currentValidationStatus={currentValidationStatus}
					disabledFeatures={disabledFeatures}
					launchGameCallback={launchGameCallback}
					launchGameDisabled={launchGameDisabled}
					launchGameDisabledReason={launchGameDisabledReason}
					launchReady={launchReady}
					launchingGame={launchingGame}
					madeEdits={madeEdits}
					saveCollectionCallback={saveCollectionCallback}
					savingCollection={savingCollection}
					validateCollectionCallback={validateCollectionCallback}
					validatingCollection={validatingCollection}
				/>
			</div>
			<div className={toolbarRowClassName}>
				<CollectionSelector
					activeCollectionName={activeCollection?.name}
					changeActiveCollectionCallback={changeActiveCollectionCallback}
					disabledFeatures={disabledFeatures}
					sortedCollectionNames={sortedCollectionNames}
				/>
				{resultSummary ? (
					<div
						id={resultSummaryId}
						className="min-w-0 shrink-0 text-ui leading-[var(--app-leading-ui)] text-text-muted max-[760px]:w-full"
						aria-live="polite"
					>
						<span>{resultSummary}</span>
					</div>
				) : null}
				<ToolbarSecondaryMenus
					disabledFeatures={disabledFeatures}
					handleCopyCollection={handleCopyCollection}
					onReloadModListCallback={onReloadModListCallback}
					openCollectionModal={openCollectionModal}
					openModal={openModal}
					openViewSettingsCallback={openViewSettingsCallback}
				/>
			</div>
		</div>
	);
}

export default memo(CollectionManagementToolbarComponent);

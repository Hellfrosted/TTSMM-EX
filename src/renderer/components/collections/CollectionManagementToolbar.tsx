import { Suspense, lazy, memo, useState } from 'react';
import { CollectionManagerModalType, NotificationProps } from 'model';
import { Copy, Edit3, FileJson, Plus, RefreshCw, Save, Search, Settings2, Trash2, X } from 'lucide-react';
import {
	desktopControlBaseClassName,
	desktopControlFocusClassName,
	desktopDangerButtonToneClassName,
	desktopDisabledClassName,
	desktopPrimaryButtonToneClassName
} from 'renderer/components/desktop-control-classes';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { CollectionNamingModalType } from './CollectionNamingModal';

const CollectionNamingModalLazy = lazy(() => import('./CollectionNamingModal'));
const collectionToolbarControlClassName = [
	desktopControlBaseClassName,
	desktopDisabledClassName,
	'focus-visible:relative focus-visible:z-[1]',
	desktopControlFocusClassName
].join(' ');
const collectionToolbarButtonBaseClassName = [
	collectionToolbarControlClassName,
	'inline-flex cursor-pointer items-center justify-center gap-2 px-3 font-[650] max-[1100px]:w-control max-[1100px]:min-w-control max-[1100px]:px-0',
	'enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]'
].join(' ');
const collectionToolbarPrimaryButtonClassName = [collectionToolbarButtonBaseClassName, desktopPrimaryButtonToneClassName].join(' ');
const collectionToolbarDangerButtonClassName = [collectionToolbarButtonBaseClassName, desktopDangerButtonToneClassName].join(' ');
const collectionToolbarLabelClassName = 'inline-flex min-w-0 items-center overflow-hidden text-ellipsis max-[1100px]:hidden';

interface CollectionManagementToolbarProps {
	madeEdits: boolean;
	searchString: string;
	appState: Pick<CollectionWorkspaceAppState, 'activeCollection' | 'allCollectionNames' | 'loadingMods'>;
	savingCollection?: boolean;
	numResults?: number;
	onReloadModListCallback: () => void;
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

function CollectionManagementToolbarComponent({
	openModal,
	saveCollectionCallback,
	appState,
	changeActiveCollectionCallback,
	savingCollection,
	numResults,
	onSearchCallback,
	onSearchChangeCallback,
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
	const sortedCollectionNames = [...appState.allCollectionNames].sort();

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
		<div id="mod-collection-toolbar" className="flex flex-col gap-3 max-[720px]:gap-2">
			{!modalType ? null : (
				<Suspense fallback={null}>
					<CollectionNamingModalLazy
						activeCollectionName={activeCollection?.name}
						allCollectionNames={appState.allCollectionNames}
						modalType={modalType}
						initialName={initialCollectionName}
						savingCollection={savingCollection}
						closeModal={() => {
							setModalType(undefined);
							setInitialCollectionName('');
						}}
						newCollectionCallback={newCollectionCallback}
						duplicateCollectionCallback={duplicateCollectionCallback}
						renameCollectionCallback={renameCollectionCallback}
					/>
				</Suspense>
			)}
			<div>
				<div className="min-w-0">
					<div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 max-[1100px]:gap-x-2.5 max-[720px]:gap-2">
						<div className="min-w-[220px] max-w-[360px] flex-[0_1_280px] max-[1100px]:max-w-none max-[1100px]:basis-full max-[720px]:min-w-0">
							<select
								className={[collectionToolbarControlClassName, 'w-full px-[11px]'].join(' ')}
								value={activeCollection?.name || ''}
								aria-label="Select the active collection"
								onChange={(event) => {
									changeActiveCollectionCallback(event.target.value);
								}}
								disabled={disabledFeatures}
							>
								{activeCollection ? null : <option value="">No collection selected</option>}
								{sortedCollectionNames.map((name: string) => {
									return (
										<option key={name} value={name}>
											{name}
										</option>
									);
								})}
							</select>
						</div>
						<div className="flex min-w-0 items-center" role="group" aria-label="Collection actions">
							<div className="inline-flex min-h-[38px] flex-1 flex-wrap items-center gap-2.5 max-[1100px]:gap-2">
								<button
									key="rename"
									className={collectionToolbarButtonBaseClassName}
									aria-label="Rename"
									title="Rename collection"
									onClick={() => {
										openCollectionModal('rename-collection');
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<Edit3 size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>Rename</span>
								</button>
								<button
									key="new"
									className={collectionToolbarButtonBaseClassName}
									aria-label="New"
									title="Create collection"
									disabled={disabledFeatures}
									onClick={() => {
										openCollectionModal('new-collection');
									}}
									type="button"
								>
									<Plus size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>New</span>
								</button>
								<button
									key="save"
									className={collectionToolbarPrimaryButtonClassName}
									aria-label="Save Collection"
									title="Save collection"
									onClick={saveCollectionCallback}
									disabled={disabledFeatures || !madeEdits}
									type="button"
								>
									{savingCollection ? (
										<span
											className="h-3.5 w-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
											aria-hidden="true"
										/>
									) : (
										<Save size={16} aria-hidden="true" />
									)}
									<span className={collectionToolbarLabelClassName}>Save Collection</span>
								</button>
								<button
									key="duplicate"
									className={collectionToolbarButtonBaseClassName}
									aria-label="Duplicate"
									title="Duplicate collection"
									onClick={() => {
										openCollectionModal('duplicate-collection');
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<Copy size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>Duplicate</span>
								</button>
								<button
									key="copy-export"
									className={collectionToolbarButtonBaseClassName}
									aria-label="Copy JSON"
									title="Copy JSON export"
									onClick={() => {
										void handleCopyCollection();
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<FileJson size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>Copy JSON</span>
								</button>
								<button
									key="delete"
									className={collectionToolbarDangerButtonClassName}
									aria-label="Delete"
									title="Delete collection"
									onClick={() => {
										openModal(CollectionManagerModalType.WARN_DELETE);
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<Trash2 size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>Delete</span>
								</button>
							</div>
						</div>
						<div
							className="ml-auto flex min-w-0 items-center border-l border-border pl-4 max-[1100px]:pl-3 max-[720px]:pl-2.5"
							role="group"
							aria-label="Table utilities"
						>
							<div className="inline-flex min-h-[38px] flex-wrap items-center justify-end gap-2.5 max-[1100px]:gap-2">
								<button
									key="reload"
									className={collectionToolbarButtonBaseClassName}
									aria-label="Reload"
									title="Reload mods"
									onClick={onReloadModListCallback}
									disabled={disabledFeatures}
									type="button"
								>
									<RefreshCw size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>Reload</span>
								</button>
								<button
									key="view-options"
									className={collectionToolbarButtonBaseClassName}
									aria-label="Table Options"
									title="Table options"
									onClick={openViewSettingsCallback}
									disabled={disabledFeatures}
									type="button"
								>
									<Settings2 size={16} aria-hidden="true" />
									<span className={collectionToolbarLabelClassName}>Table Options</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div>
				<div className="min-w-0">
					<div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 max-[1199px]:grid-cols-1">
						<div className="min-w-0">
							<div className="flex min-h-control w-full items-center">
								<div className="flex w-full min-w-0">
									<input
										className={[collectionToolbarControlClassName, 'min-w-0 flex-auto rounded-r-none px-[11px]'].join(' ')}
										aria-label="Search mods by name, ID, author, or tag"
										placeholder="Search mods by name, ID, author, or tag"
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
										<button
											aria-label="Clear search"
											className={[
												collectionToolbarControlClassName,
												'inline-flex w-control cursor-pointer items-center justify-center rounded-none border-l-0 font-[650] enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]'
											].join(' ')}
											type="button"
											disabled={disabledFeatures}
											onClick={() => {
												onSearchChangeCallback('');
												onSearchCallback('');
											}}
										>
											<X size={16} aria-hidden="true" />
										</button>
									) : null}
									<button
										aria-label="Search"
										className={[
											collectionToolbarControlClassName,
											'inline-flex w-control cursor-pointer items-center justify-center rounded-l-none border-l-0 border-primary bg-primary font-[650] enabled:hover:border-primary-hover enabled:hover:bg-primary-hover'
										].join(' ')}
										type="button"
										disabled={disabledFeatures}
										onClick={() => {
											onSearchCallback(searchString);
										}}
									>
										<Search size={16} aria-hidden="true" />
									</button>
								</div>
							</div>
						</div>
						<div className="min-w-0">
							<div className="flex min-h-control w-full items-center justify-end text-text-muted max-[1199px]:justify-start">
								<div className="inline-flex min-h-[38px] flex-wrap items-center justify-end gap-2.5 max-[1199px]:justify-start">
									{numResults !== undefined ? <span>{`${numResults} mod${numResults === 1 ? '' : 's'} shown`}</span> : null}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default memo(CollectionManagementToolbarComponent);

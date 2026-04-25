import { Suspense, lazy, memo, useState } from 'react';
import { CollectionManagerModalType, NotificationProps } from 'model';
import { Copy, Edit3, FileJson, Plus, RefreshCw, Save, Search, Settings2, Trash2, X } from 'lucide-react';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { CollectionNamingModalType } from './CollectionNamingModal';

const CollectionNamingModalLazy = lazy(() => import('./CollectionNamingModal'));

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
		<div id="mod-collection-toolbar" className="CollectionToolbar">
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
			<div className="CollectionToolbarRow">
				<div className="CollectionToolbarColumn">
					<div className="CollectionToolbarPrimaryBar">
						<div className="CollectionToolbarCollectionSelector">
							<select
								className="CollectionToolbarSelect"
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
						<div
							className="CollectionToolbarActionGroup CollectionToolbarActionGroup--collection"
							role="group"
							aria-label="Collection actions"
						>
							<div className="CollectionToolbarActions CollectionToolbarActions--primary">
								<button
									key="rename"
									className="CollectionToolbarButton"
									aria-label="Rename"
									title="Rename collection"
									onClick={() => {
										openCollectionModal('rename-collection');
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<Edit3 size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">Rename</span>
								</button>
								<button
									key="new"
									className="CollectionToolbarButton"
									aria-label="New"
									title="Create collection"
									disabled={disabledFeatures}
									onClick={() => {
										openCollectionModal('new-collection');
									}}
									type="button"
								>
									<Plus size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">New</span>
								</button>
								<button
									key="save"
									className="CollectionToolbarButton CollectionToolbarButton--primary"
									aria-label="Save Collection"
									title="Save collection"
									onClick={saveCollectionCallback}
									disabled={disabledFeatures || !madeEdits}
									type="button"
								>
									{savingCollection ? (
										<span className="CollectionToolbarButtonSpinner" aria-hidden="true" />
									) : (
										<Save size={16} aria-hidden="true" />
									)}
									<span className="CollectionToolbarButtonLabel">Save Collection</span>
								</button>
								<button
									key="duplicate"
									className="CollectionToolbarButton"
									aria-label="Duplicate"
									title="Duplicate collection"
									onClick={() => {
										openCollectionModal('duplicate-collection');
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<Copy size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">Duplicate</span>
								</button>
								<button
									key="copy-export"
									className="CollectionToolbarButton"
									aria-label="Copy JSON"
									title="Copy JSON export"
									onClick={() => {
										void handleCopyCollection();
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<FileJson size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">Copy JSON</span>
								</button>
								<button
									key="delete"
									className="CollectionToolbarButton CollectionToolbarButton--danger"
									aria-label="Delete"
									title="Delete collection"
									onClick={() => {
										openModal(CollectionManagerModalType.WARN_DELETE);
									}}
									disabled={disabledFeatures}
									type="button"
								>
									<Trash2 size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">Delete</span>
								</button>
							</div>
						</div>
						<div className="CollectionToolbarActionGroup CollectionToolbarActionGroup--utility" role="group" aria-label="Table utilities">
							<div className="CollectionToolbarActions CollectionToolbarActions--utility">
								<button
									key="reload"
									className="CollectionToolbarButton"
									aria-label="Reload"
									title="Reload mods"
									onClick={onReloadModListCallback}
									disabled={disabledFeatures}
									type="button"
								>
									<RefreshCw size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">Reload</span>
								</button>
								<button
									key="view-options"
									className="CollectionToolbarButton"
									aria-label="Table Options"
									title="Table options"
									onClick={openViewSettingsCallback}
									disabled={disabledFeatures}
									type="button"
								>
									<Settings2 size={16} aria-hidden="true" />
									<span className="CollectionToolbarButtonLabel">Table Options</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="CollectionToolbarRow CollectionToolbarRow--search">
				<div className="CollectionToolbarColumn">
					<div className="CollectionToolbarSecondaryBar">
						<div className="CollectionToolbarSearchColumn">
							<div className="CollectionToolbarSearch">
								<div className="CollectionToolbarSearchBox">
									<input
										className="CollectionToolbarSearchInput"
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
											className="CollectionToolbarSearchClear"
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
										className="CollectionToolbarSearchSubmit"
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
						<div className="CollectionToolbarMetaColumn">
							<div className="CollectionToolbarMeta">
								<div className="CollectionToolbarActions CollectionToolbarActions--secondary">
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

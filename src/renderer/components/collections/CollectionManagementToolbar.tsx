import { Suspense, lazy, memo, useState } from 'react';
import { AppState, CollectionManagerModalType, NotificationProps } from 'model';
import { Button, Col, Row, Select, Space, Input } from 'antd';
import CopyOutlined from '@ant-design/icons/es/icons/CopyOutlined';
import DeleteOutlined from '@ant-design/icons/es/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/es/icons/EditOutlined';
import ExportOutlined from '@ant-design/icons/es/icons/ExportOutlined';
import PlusOutlined from '@ant-design/icons/es/icons/PlusOutlined';
import SaveOutlined from '@ant-design/icons/es/icons/SaveOutlined';
import SettingFilled from '@ant-design/icons/es/icons/SettingFilled';
import SyncOutlined from '@ant-design/icons/es/icons/SyncOutlined';
import type { CollectionNamingModalType } from './CollectionNamingModal';

const { Option } = Select;
const { Search } = Input;

const CollectionNamingModalLazy = lazy(() => import('./CollectionNamingModal'));

interface CollectionManagementToolbarProps {
	madeEdits: boolean;
	searchString: string;
	appState: AppState;
	savingCollection?: boolean;
	numResults?: number;
	loadingMods?: boolean;
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
	const [modalText, setModalText] = useState('');
	const disabledFeatures = !!savingCollection || !!appState.loadingMods || !!modalType;
	const { activeCollection } = appState;

	const openCollectionModal = (nextModalType: CollectionNamingModalType) => {
		const nextText =
			nextModalType === 'rename-collection'
				? activeCollection?.name || ''
				: nextModalType === 'duplicate-collection' && activeCollection
					? `${activeCollection.name} copy`
					: '';

		setModalType(nextModalType);
		setModalText(nextText);
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
						modalText={modalText}
						savingCollection={savingCollection}
						setModalText={setModalText}
						closeModal={() => {
							setModalType(undefined);
							setModalText('');
						}}
						newCollectionCallback={newCollectionCallback}
						duplicateCollectionCallback={duplicateCollectionCallback}
						renameCollectionCallback={renameCollectionCallback}
					/>
				</Suspense>
			)}
			<Row key="row1" justify="space-between" gutter={16} className="CollectionToolbarRow">
				<Col xs={24} flex="auto">
					<div className="CollectionToolbarPrimaryBar">
						<div className="CollectionToolbarCollectionSelector">
							<Select
								style={{ width: '100%' }}
								value={activeCollection?.name}
								aria-label="Select the active collection"
								onSelect={(value: string) => {
									changeActiveCollectionCallback(value);
								}}
								disabled={disabledFeatures}
							>
								{[...appState.allCollectionNames].sort().map((name: string) => {
									return (
										<Option key={name} value={name}>
											{name}
										</Option>
									);
								})}
							</Select>
						</div>
						<div className="CollectionToolbarActionGroup CollectionToolbarActionGroup--collection" role="group" aria-label="Collection actions">
							<Space align="center" size={10} wrap className="CollectionToolbarActions CollectionToolbarActions--primary">
								<Button
									key="rename"
									aria-label="Rename"
									title="Rename collection"
									icon={<EditOutlined />}
									onClick={() => {
										openCollectionModal('rename-collection');
									}}
									disabled={disabledFeatures}
								>
									<span className="CollectionToolbarButtonLabel">Rename</span>
								</Button>
								<Button
									key="new"
									aria-label="New"
									title="Create collection"
									icon={<PlusOutlined />}
									disabled={disabledFeatures}
									onClick={() => {
										openCollectionModal('new-collection');
									}}
								>
									<span className="CollectionToolbarButtonLabel">New</span>
								</Button>
								<Button
									key="save"
									aria-label="Save Collection"
									title="Save collection"
									type="primary"
									icon={<SaveOutlined />}
									onClick={saveCollectionCallback}
									disabled={disabledFeatures || !madeEdits}
									loading={savingCollection}
								>
									<span className="CollectionToolbarButtonLabel">Save Collection</span>
								</Button>
								<Button
									key="duplicate"
									aria-label="Duplicate"
									title="Duplicate collection"
									icon={<CopyOutlined />}
									onClick={() => {
										openCollectionModal('duplicate-collection');
									}}
									disabled={disabledFeatures}
								>
									<span className="CollectionToolbarButtonLabel">Duplicate</span>
								</Button>
								<Button
									key="copy-export"
									aria-label="Copy JSON"
									title="Copy JSON export"
									icon={<ExportOutlined />}
									onClick={() => {
										void handleCopyCollection();
									}}
									disabled={disabledFeatures}
								>
									<span className="CollectionToolbarButtonLabel">Copy JSON</span>
								</Button>
								<Button
									key="delete"
									aria-label="Delete"
									title="Delete collection"
									danger
									icon={<DeleteOutlined />}
									onClick={() => {
										openModal(CollectionManagerModalType.WARN_DELETE);
									}}
									disabled={disabledFeatures}
								>
									<span className="CollectionToolbarButtonLabel">Delete</span>
								</Button>
							</Space>
						</div>
						<div className="CollectionToolbarActionGroup CollectionToolbarActionGroup--utility" role="group" aria-label="Table utilities">
							<Space align="center" size={10} wrap className="CollectionToolbarActions CollectionToolbarActions--utility">
								<Button
									key="reload"
									aria-label="Reload"
									title="Reload mods"
									icon={<SyncOutlined />}
									onClick={onReloadModListCallback}
									disabled={disabledFeatures}
								>
									<span className="CollectionToolbarButtonLabel">Reload</span>
								</Button>
								<Button
									key="view-options"
									aria-label="Table Options"
									title="Table options"
									icon={<SettingFilled />}
									onClick={openViewSettingsCallback}
									disabled={disabledFeatures}
								>
									<span className="CollectionToolbarButtonLabel">Table Options</span>
								</Button>
							</Space>
						</div>
					</div>
				</Col>
			</Row>
			<Row key="row2" justify="space-between" align="middle" gutter={16} className="CollectionToolbarRow">
				<Col flex="auto">
					<Row gutter={[24, 12]}>
						<Col xs={24} xl={16} key="search">
							<div className="CollectionToolbarSearch">
								<Search
									aria-label="Search mods by name, ID, author, or tag"
									placeholder="Search mods by name, ID, author, or tag"
									onChange={(event) => {
										onSearchChangeCallback(event.target.value);
									}}
									value={searchString}
									onSearch={onSearchCallback}
									enterButton
									disabled={disabledFeatures}
									allowClear
								/>
							</div>
						</Col>
						<Col xs={24} xl={8} key="right">
							<div className="CollectionToolbarMeta">
								<Space align="center" size={10} wrap className="CollectionToolbarActions CollectionToolbarActions--secondary">
									{numResults !== undefined ? <span>{`${numResults} mod${numResults === 1 ? '' : 's'} shown`}</span> : null}
								</Space>
							</div>
						</Col>
					</Row>
				</Col>
			</Row>
		</div>
	);
}

export default memo(CollectionManagementToolbarComponent);

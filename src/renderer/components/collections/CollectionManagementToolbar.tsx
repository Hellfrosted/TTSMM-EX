import { Suspense, lazy, memo, useState } from 'react';
import { AppState, CollectionManagerModalType, NotificationProps } from 'model';
import { Button, Col, Row, Select, Space, Input } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined, SyncOutlined, CopyOutlined, SettingFilled, CodeOutlined } from '@ant-design/icons';
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

	const handleCopyCollection = () => {
		if (!activeCollection) {
			openNotification(
				{
					message: 'No active collection selected',
					description: 'Choose a collection before copying its JSON payload.',
					placement: 'topRight',
					duration: 2
				},
				'warn'
			);
			return;
		}

		navigator.clipboard.writeText(JSON.stringify(activeCollection, null, '\t'));
		openNotification(
			{
				message: 'Collection copied',
				description: `${activeCollection.name} was copied to the clipboard as JSON.`,
				placement: 'topRight',
				duration: 1
			},
			'success'
		);
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
						<Space align="center" size={10} wrap className="CollectionToolbarActions CollectionToolbarActions--primary">
							<Button
								key="rename"
								icon={<EditOutlined />}
								onClick={() => {
									openCollectionModal('rename-collection');
								}}
								disabled={disabledFeatures}
							>
								Rename
							</Button>
							<Button
								key="new"
								icon={<PlusOutlined />}
								disabled={disabledFeatures}
								onClick={() => {
									openCollectionModal('new-collection');
								}}
							>
								New
							</Button>
							<Button
								key="duplicate"
								icon={<CopyOutlined />}
								disabled={disabledFeatures}
								onClick={() => {
									openCollectionModal('duplicate-collection');
								}}
							>
								Duplicate
							</Button>
							<Button
								key="save"
								type="primary"
								icon={<SaveOutlined />}
								onClick={saveCollectionCallback}
								disabled={disabledFeatures || !madeEdits}
								loading={savingCollection}
							>
								Save Collection
							</Button>
							<Button key="copy" icon={<CodeOutlined />} disabled={disabledFeatures} onClick={handleCopyCollection}>
								Copy JSON
							</Button>
							<Button
								key="delete"
								danger
								icon={<DeleteOutlined />}
								disabled={disabledFeatures}
								onClick={() => {
									openModal(CollectionManagerModalType.WARN_DELETE);
								}}
							>
								Delete
							</Button>
						</Space>
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
									{numResults !== undefined ? (
										<span>{`${numResults} mod${numResults === 1 ? '' : 's'} shown`}</span>
									) : null}
									<Button
										icon={<SyncOutlined />}
										disabled={disabledFeatures}
										onClick={() => {
											onReloadModListCallback();
										}}
									>
										Reload Mods
									</Button>
									<Button
										icon={<SettingFilled />}
										disabled={disabledFeatures}
										onClick={() => {
											openViewSettingsCallback();
										}}
									>
										View Options
									</Button>
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

import { memo, useMemo, useState } from 'react';
import { AppState, CollectionManagerModalType, NotificationProps } from 'model';
import { Button, Col, Dropdown, Row, Select, Space, Input, Modal, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
	EditOutlined,
	PlusOutlined,
	SaveOutlined,
	DeleteOutlined,
	SyncOutlined,
	CheckCircleOutlined,
	CopyOutlined,
	DownOutlined,
	CloseCircleOutlined,
	SettingFilled
} from '@ant-design/icons';
import { validateCollectionName } from 'shared/collection-name';

const { Option } = Select;
const { Search } = Input;
const { Text } = Typography;

enum CollectionManagementToolbarModalType {
	NEW_COLLECTION = 'new-collection',
	DUPLICATE_COLLECTION = 'duplicate-collection',
	RENAME_COLLECTION = 'rename-collection'
}

interface CollectionManagementToolbarProps {
	madeEdits: boolean;
	searchString: string;
	appState: AppState;
	savingCollection?: boolean;
	validatingCollection?: boolean;
	numResults?: number;
	lastValidationStatus?: boolean;
	loadingMods?: boolean;
	onReloadModListCallback: () => void;
	openViewSettingsCallback: () => void;
	onSearchCallback: (search: string) => void;
	onSearchChangeCallback: (search: string) => void;
	saveCollectionCallback: () => void;
	validateCollectionCallback: () => void;
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
	validatingCollection,
	validateCollectionCallback,
	numResults,
	onSearchCallback,
	onSearchChangeCallback,
	searchString,
	madeEdits,
	lastValidationStatus,
	openViewSettingsCallback,
	onReloadModListCallback,
	openNotification,
	newCollectionCallback,
	duplicateCollectionCallback,
	renameCollectionCallback
}: CollectionManagementToolbarProps) {
	const [modalType, setModalType] = useState<CollectionManagementToolbarModalType>();
	const [modalText, setModalText] = useState('');
	const disabledFeatures = !!savingCollection || !!appState.loadingMods || !!modalType;
	const { activeCollection } = appState;

	const modalProps = useMemo(
		() => ({
			[CollectionManagementToolbarModalType.NEW_COLLECTION]: {
				title: 'New Collection',
				okText: 'Create New Collection',
				callback: newCollectionCallback
			},
			[CollectionManagementToolbarModalType.DUPLICATE_COLLECTION]: {
				title: 'Duplicate Collection',
				okText: 'Duplicate Collection',
				callback: duplicateCollectionCallback
			},
			[CollectionManagementToolbarModalType.RENAME_COLLECTION]: {
				title: 'Rename Collection',
				okText: 'Rename Collection',
				callback: renameCollectionCallback
			}
		}),
		[duplicateCollectionCallback, newCollectionCallback, renameCollectionCallback]
	);

	const newCollectionMenu: MenuProps = {
		items: [
			{
				key: 'duplicate',
				label: 'Duplicate'
			}
		],
		onClick: ({ key }) => {
			if (key === 'duplicate') {
				setModalType(CollectionManagementToolbarModalType.DUPLICATE_COLLECTION);
			}
		}
	};

	const currentModal = modalType ? modalProps[modalType] : undefined;
	const currentModalError = useMemo(() => {
		if (!modalType) {
			return undefined;
		}

		const validationError = validateCollectionName(modalText);
		if (validationError) {
			return validationError;
		}

		if (modalType === CollectionManagementToolbarModalType.RENAME_COLLECTION && modalText === activeCollection?.name) {
			return 'Collection name is unchanged';
		}

		if (appState.allCollectionNames.has(modalText)) {
			return 'A collection with that name already exists';
		}

		return undefined;
	}, [activeCollection?.name, appState.allCollectionNames, modalText, modalType]);

	return (
		<div id="mod-collection-toolbar" className="CollectionToolbar">
			{!currentModal ? null : (
				<Modal
					title={currentModal.title}
					open
					closable={false}
					okText={currentModal.okText}
					onCancel={() => {
						setModalType(undefined);
						setModalText('');
					}}
					okButtonProps={{
						disabled: !!currentModalError,
						loading: savingCollection
					}}
					onOk={() => {
						if (currentModalError) {
							return;
						}
						setModalType(undefined);
						setModalText('');
						currentModal.callback(modalText);
					}}
				>
					<Input
						value={modalText}
						onChange={(event) => {
							setModalText(event.target.value);
						}}
					/>
					{currentModalError ? (
						<Text type="danger">
							{currentModalError}
						</Text>
					) : null}
				</Modal>
			)}
			<Row key="row1" justify="space-between" gutter={16} className="CollectionToolbarRow">
				<Col flex="auto">
					<Row gutter={16}>
						<Col span={8} key="collections">
							<Select
								style={{ width: '100%' }}
								value={activeCollection?.name}
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
						</Col>
						<Col>
							<Space align="center" size={10}>
								<Button
									key="rename"
									icon={<EditOutlined />}
									onClick={() => {
										setModalType(CollectionManagementToolbarModalType.RENAME_COLLECTION);
									}}
									disabled={disabledFeatures}
								>
									Rename
								</Button>
								<Space.Compact>
									<Button
										key="new"
										icon={<PlusOutlined />}
										disabled={disabledFeatures}
										onClick={() => {
											setModalType(CollectionManagementToolbarModalType.NEW_COLLECTION);
										}}
									>
										New
									</Button>
									<Dropdown menu={newCollectionMenu} disabled={disabledFeatures} trigger={['click']}>
										<Button
											aria-label="Open additional collection actions"
											icon={<DownOutlined />}
											disabled={disabledFeatures}
										/>
									</Dropdown>
								</Space.Compact>
							</Space>
						</Col>
					</Row>
				</Col>
				<Col flex="none" style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
					<Space align="center" size={10}>
						<Button
							key="copy"
							type="default"
							icon={<CopyOutlined />}
							disabled={disabledFeatures}
							loading={savingCollection}
							onClick={() => {
								navigator.clipboard.writeText(JSON.stringify(activeCollection, null, '\t'));
								openNotification(
									{
										message: 'Copied collection to clipboard',
										placement: 'topRight',
										duration: 1
									},
									'success'
								);
							}}
						>
							Copy
						</Button>
						<Button
							key="save"
							type="primary"
							icon={<SaveOutlined />}
							onClick={saveCollectionCallback}
							disabled={disabledFeatures || !madeEdits}
							loading={savingCollection}
						>
							Save
						</Button>
						<Button
							danger
							key="delete"
							icon={<DeleteOutlined />}
							onClick={() => {
								openModal(CollectionManagerModalType.WARN_DELETE);
							}}
							disabled={disabledFeatures}
						>
							Delete
						</Button>
					</Space>
				</Col>
			</Row>
			<Row key="row2" justify="space-between" align="middle" gutter={16} className="CollectionToolbarRow">
				<Col flex="auto">
					<Row gutter={24}>
						<Col span={numResults !== undefined ? 16 : 24} key="search">
							<div className="CollectionToolbarSearch">
								<Search
									placeholder="Search mods"
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
						{numResults !== undefined ? (
							<Col span={8} key="right">
								<div className="CollectionToolbarMeta">
									<span>{numResults} mods found</span>
								</div>
							</Col>
						) : null}
					</Row>
				</Col>
				<Col key="tools" flex="none" className="CollectionToolbarActionCol">
					<Space align="center" className="CollectionToolbarActions" size={10}>
						<Button
							key="reload"
							type="default"
							icon={<SyncOutlined spin={!!appState.loadingMods} />}
							disabled={disabledFeatures}
							onClick={onReloadModListCallback}
						>
							Reload Mods
						</Button>
						<Button
							key="validate"
							type="primary"
							danger={!lastValidationStatus}
							icon={validatingCollection ? <SyncOutlined spin /> : lastValidationStatus ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
							disabled={disabledFeatures || validatingCollection}
							onClick={validateCollectionCallback}
						>
							Validate
						</Button>
						<Button icon={<SettingFilled />} onClick={openViewSettingsCallback}>
							View
						</Button>
					</Space>
				</Col>
			</Row>
		</div>
	);
}

export default memo(CollectionManagementToolbarComponent);

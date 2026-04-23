import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, CollectionManagerModalType, NotificationProps } from 'model';
import { Button, Col, Row, Select, Space, Input, Modal, Form } from 'antd';
import type { InputRef } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined, SyncOutlined, CopyOutlined, SettingFilled, CodeOutlined } from '@ant-design/icons';
import { validateCollectionName } from 'shared/collection-name';

const { Option } = Select;
const { Search } = Input;

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
	const [modalType, setModalType] = useState<CollectionManagementToolbarModalType>();
	const [modalText, setModalText] = useState('');
	const disabledFeatures = !!savingCollection || !!appState.loadingMods || !!modalType;
	const { activeCollection } = appState;
	const trimmedModalText = modalText.trim();
	const collectionNameLabelId = 'collection-name-label';
	const collectionNameInputId = 'collection-name-input';
	const collectionNameErrorId = 'collection-name-error';
	const collectionNameInputRef = useRef<InputRef>(null);

	useEffect(() => {
		if (!modalType) {
			return;
		}

		const animationFrame = window.requestAnimationFrame(() => {
			collectionNameInputRef.current?.focus();
		});

		return () => {
			window.cancelAnimationFrame(animationFrame);
		};
	}, [modalType]);

	const modalProps = useMemo(
		() => ({
			[CollectionManagementToolbarModalType.NEW_COLLECTION]: {
				title: 'New Collection',
				okText: 'Create New Collection',
				fieldLabel: 'Collection name',
				fieldHelp: 'Use a short name you can recognize in the collection picker.',
				placeholder: 'Example: Campaign mods',
				callback: newCollectionCallback
			},
			[CollectionManagementToolbarModalType.DUPLICATE_COLLECTION]: {
				title: 'Duplicate Collection',
				okText: 'Duplicate Collection',
				fieldLabel: 'New collection name',
				fieldHelp: 'The duplicate keeps the current mod list and saves it under a new name.',
				placeholder: 'Example: Campaign mods copy',
				callback: duplicateCollectionCallback
			},
			[CollectionManagementToolbarModalType.RENAME_COLLECTION]: {
				title: 'Rename Collection',
				okText: 'Rename Collection',
				fieldLabel: 'New collection name',
				fieldHelp: 'Rename the saved collection without changing its enabled mods.',
				placeholder: 'Example: Campaign mods',
				callback: renameCollectionCallback
			}
		}),
		[duplicateCollectionCallback, newCollectionCallback, renameCollectionCallback]
	);

	const currentModal = modalType ? modalProps[modalType] : undefined;
	const currentModalError = useMemo(() => {
		if (!modalType) {
			return undefined;
		}

		const validationError = validateCollectionName(trimmedModalText);
		if (validationError) {
			return validationError;
		}

		if (modalType === CollectionManagementToolbarModalType.RENAME_COLLECTION && trimmedModalText === activeCollection?.name) {
			return 'Collection name is unchanged';
		}

		if (appState.allCollectionNames.has(trimmedModalText)) {
			return 'A collection with that name already exists';
		}

		return undefined;
	}, [activeCollection?.name, appState.allCollectionNames, modalType, trimmedModalText]);

	const openCollectionModal = (nextModalType: CollectionManagementToolbarModalType) => {
		const nextText =
			nextModalType === CollectionManagementToolbarModalType.RENAME_COLLECTION
				? activeCollection?.name || ''
				: nextModalType === CollectionManagementToolbarModalType.DUPLICATE_COLLECTION && activeCollection
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
						currentModal.callback(trimmedModalText);
					}}
				>
					<Form layout="vertical">
						<Form.Item
							label={<span id={collectionNameLabelId}>{currentModal.fieldLabel}</span>}
							extra={currentModal.fieldHelp}
							validateStatus={currentModalError ? 'error' : undefined}
							help={
								currentModalError ? (
									<span id={collectionNameErrorId}>
										{currentModalError}
									</span>
								) : null
							}
						>
							<Input
								id={collectionNameInputId}
								ref={collectionNameInputRef}
								value={modalText}
								placeholder={currentModal.placeholder}
								aria-labelledby={collectionNameLabelId}
								aria-describedby={currentModalError ? collectionNameErrorId : undefined}
								aria-invalid={currentModalError ? 'true' : 'false'}
								onChange={(event) => {
									setModalText(event.target.value);
								}}
								onPressEnter={() => {
									if (!currentModalError) {
										setModalType(undefined);
										setModalText('');
										currentModal.callback(trimmedModalText);
									}
								}}
							/>
						</Form.Item>
					</Form>
				</Modal>
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
									openCollectionModal(CollectionManagementToolbarModalType.RENAME_COLLECTION);
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
									openCollectionModal(CollectionManagementToolbarModalType.NEW_COLLECTION);
								}}
							>
								New
							</Button>
							<Button
								key="duplicate"
								icon={<CopyOutlined />}
								disabled={disabledFeatures}
								onClick={() => {
									openCollectionModal(CollectionManagementToolbarModalType.DUPLICATE_COLLECTION);
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

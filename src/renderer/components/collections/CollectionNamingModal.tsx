import { useEffect, useMemo, useRef } from 'react';
import { Form, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { validateCollectionName } from 'shared/collection-name';

export type CollectionNamingModalType = 'new-collection' | 'duplicate-collection' | 'rename-collection';

interface CollectionNamingModalProps {
	activeCollectionName?: string;
	allCollectionNames: Set<string>;
	modalType: CollectionNamingModalType;
	modalText: string;
	savingCollection?: boolean;
	setModalText: (value: string) => void;
	closeModal: () => void;
	newCollectionCallback: (name: string) => void;
	duplicateCollectionCallback: (name: string) => void;
	renameCollectionCallback: (name: string) => void;
}

export default function CollectionNamingModal({
	activeCollectionName,
	allCollectionNames,
	modalType,
	modalText,
	savingCollection,
	setModalText,
	closeModal,
	newCollectionCallback,
	duplicateCollectionCallback,
	renameCollectionCallback
}: CollectionNamingModalProps) {
	const collectionNameLabelId = 'collection-name-label';
	const collectionNameInputId = 'collection-name-input';
	const collectionNameErrorId = 'collection-name-error';
	const collectionNameInputRef = useRef<InputRef>(null);
	const trimmedModalText = modalText.trim();

	useEffect(() => {
		const animationFrame = window.requestAnimationFrame(() => {
			collectionNameInputRef.current?.focus();
		});

		return () => {
			window.cancelAnimationFrame(animationFrame);
		};
	}, []);

	const currentModal = useMemo(
		() =>
			({
				'new-collection': {
					title: 'New Collection',
					okText: 'Create New Collection',
					fieldLabel: 'Collection name',
					fieldHelp: 'Use a short name you can recognize in the collection picker.',
					placeholder: 'Example: Campaign mods',
					callback: newCollectionCallback
				},
				'duplicate-collection': {
					title: 'Duplicate Collection',
					okText: 'Duplicate Collection',
					fieldLabel: 'New collection name',
					fieldHelp: 'The duplicate keeps the current mod list and saves it under a new name.',
					placeholder: 'Example: Campaign mods copy',
					callback: duplicateCollectionCallback
				},
				'rename-collection': {
					title: 'Rename Collection',
					okText: 'Rename Collection',
					fieldLabel: 'New collection name',
					fieldHelp: 'Rename the saved collection without changing its enabled mods.',
					placeholder: 'Example: Campaign mods',
					callback: renameCollectionCallback
				}
			})[modalType],
		[duplicateCollectionCallback, modalType, newCollectionCallback, renameCollectionCallback]
	);

	const currentModalError = useMemo(() => {
		const validationError = validateCollectionName(trimmedModalText);
		if (validationError) {
			return validationError;
		}

		if (modalType === 'rename-collection' && trimmedModalText === activeCollectionName) {
			return 'Collection name is unchanged';
		}

		if (allCollectionNames.has(trimmedModalText)) {
			return 'A collection with that name already exists';
		}

		return undefined;
	}, [activeCollectionName, allCollectionNames, modalType, trimmedModalText]);

	const submitModal = () => {
		if (currentModalError) {
			return;
		}

		closeModal();
		currentModal.callback(trimmedModalText);
	};

	return (
		<Modal
			title={currentModal.title}
			open
			okText={currentModal.okText}
			onCancel={closeModal}
			okButtonProps={{
				disabled: !!currentModalError,
				loading: savingCollection
			}}
			onOk={submitModal}
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
						onPressEnter={submitModal}
					/>
				</Form.Item>
			</Form>
		</Modal>
	);
}

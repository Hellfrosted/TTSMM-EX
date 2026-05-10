import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import {
	createCollectionNameFormSchema,
	getCollectionNameError,
	type CollectionNameFormValues,
	type CollectionNamingModalType
} from 'renderer/collection-form-validation';
import { DesktopButton, DesktopDialog, DesktopInput } from 'renderer/components/DesktopControls';

interface CollectionNamingModalProps {
	activeCollectionName?: string;
	allCollectionNames: Set<string>;
	modalType: CollectionNamingModalType;
	initialName: string;
	savingCollection?: boolean;
	closeModal: () => void;
	newCollectionCallback: (name: string) => void;
	duplicateCollectionCallback: (name: string) => void;
	renameCollectionCallback: (name: string) => void;
}

export default function CollectionNamingModal({
	activeCollectionName,
	allCollectionNames,
	modalType,
	initialName,
	savingCollection,
	closeModal,
	newCollectionCallback,
	duplicateCollectionCallback,
	renameCollectionCallback
}: CollectionNamingModalProps) {
	const collectionNameLabelId = 'collection-name-label';
	const collectionNameInputId = 'collection-name-input';
	const collectionNameErrorId = 'collection-name-error';
	const collectionNameHelpId = 'collection-name-help';
	const collectionNameInputRef = useRef<HTMLInputElement>(null);
	const collectionNameFormSchema = useMemo(
		() =>
			createCollectionNameFormSchema({
				activeCollectionName,
				allCollectionNames,
				modalType
			}),
		[activeCollectionName, allCollectionNames, modalType]
	);
	const form = useForm<CollectionNameFormValues>({
		defaultValues: { name: initialName },
		mode: 'onChange',
		resolver: zodResolver(collectionNameFormSchema)
	});
	const nameField = form.register('name');
	const watchedName = useWatch({ control: form.control, name: 'name' }) ?? '';

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

	const currentModalError = useMemo(
		() =>
			getCollectionNameError(watchedName, {
				activeCollectionName,
				allCollectionNames,
				modalType
			}),
		[activeCollectionName, allCollectionNames, modalType, watchedName]
	);

	const closeWhenIdle = () => {
		if (!savingCollection) {
			closeModal();
		}
	};

	const submitModal = form.handleSubmit((values) => {
		if (savingCollection) {
			return;
		}

		closeModal();
		currentModal.callback(values.name.trim());
	});

	return (
		<DesktopDialog
			open
			title={currentModal.title}
			titleClassName="text-title font-bold"
			closeLabel="Close collection naming modal"
			onCancel={closeWhenIdle}
			panelClassName="w-[min(520px,100%)]"
			bodyClassName="p-0"
			footer={
				<>
					<DesktopButton type="button" disabled={savingCollection} onClick={closeWhenIdle}>
						Cancel
					</DesktopButton>
					<DesktopButton
						type="submit"
						form="collection-naming-form"
						disabled={!!currentModalError || savingCollection}
						loading={savingCollection}
						variant="primary"
					>
						{currentModal.okText}
					</DesktopButton>
				</>
			}
		>
			<form id="collection-naming-form" className="flex flex-col gap-2 p-4" onSubmit={submitModal} noValidate aria-busy={savingCollection}>
				<label className="flex flex-col gap-2" htmlFor={collectionNameInputId}>
					<span id={collectionNameLabelId} className="font-[650] text-text">
						{currentModal.fieldLabel}
					</span>
					<DesktopInput
						id={collectionNameInputId}
						className="aria-invalid:border-error"
						{...nameField}
						ref={(element) => {
							nameField.ref(element);
							collectionNameInputRef.current = element;
						}}
						placeholder={currentModal.placeholder}
						aria-labelledby={collectionNameLabelId}
						aria-describedby={currentModalError ? `${collectionNameHelpId} ${collectionNameErrorId}` : collectionNameHelpId}
						aria-invalid={currentModalError ? 'true' : 'false'}
					/>
				</label>
				<span id={collectionNameHelpId} className="text-ui leading-[var(--app-leading-ui)] text-text-muted">
					{currentModal.fieldHelp}
				</span>
				{currentModalError ? (
					<span id={collectionNameErrorId} className="text-ui leading-[var(--app-leading-ui)] text-error" role="alert">
						{currentModalError}
					</span>
				) : null}
			</form>
		</DesktopDialog>
	);
}

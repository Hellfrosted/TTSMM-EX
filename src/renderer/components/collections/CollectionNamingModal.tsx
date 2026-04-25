import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { X } from 'lucide-react';
import { createCollectionNameFormSchema, getCollectionNameError, type CollectionNameFormValues } from 'renderer/collection-form-validation';

export type CollectionNamingModalType = 'new-collection' | 'duplicate-collection' | 'rename-collection';

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

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeModal();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [closeModal]);

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

	const submitModal = form.handleSubmit((values) => {
		if (savingCollection) {
			return;
		}

		closeModal();
		currentModal.callback(values.name.trim());
	});

	return (
		<div
			className="CollectionNamingModalOverlay"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					closeModal();
				}
			}}
		>
			<section aria-labelledby="collection-naming-modal-title" aria-modal="true" className="CollectionNamingModal" role="dialog">
				<header className="CollectionNamingModal__header">
					<h2 id="collection-naming-modal-title" className="CollectionNamingModal__title">
						{currentModal.title}
					</h2>
					<button aria-label="Close collection naming modal" className="CollectionNamingModal__close" type="button" onClick={closeModal}>
						<X size={18} aria-hidden="true" />
					</button>
				</header>
				<form className="CollectionNamingModal__body" onSubmit={submitModal}>
					<label id={collectionNameLabelId} className="CollectionNamingModal__label" htmlFor={collectionNameInputId}>
						{currentModal.fieldLabel}
					</label>
					<input
						id={collectionNameInputId}
						className="CollectionNamingModal__input"
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
					<span id={collectionNameHelpId} className="CollectionNamingModal__help">
						{currentModal.fieldHelp}
					</span>
					{currentModalError ? (
						<span id={collectionNameErrorId} className="CollectionNamingModal__error">
							{currentModalError}
						</span>
					) : null}
					<footer className="CollectionNamingModal__footer">
						<button className="CollectionNamingModal__button" type="button" onClick={closeModal}>
							Cancel
						</button>
						<button
							className="CollectionNamingModal__button CollectionNamingModal__button--primary"
							type="submit"
							disabled={!!currentModalError || savingCollection}
						>
							{savingCollection ? <span className="CollectionNamingModal__spinner" aria-hidden="true" /> : null}
							{currentModal.okText}
						</button>
					</footer>
				</form>
			</section>
		</div>
	);
}

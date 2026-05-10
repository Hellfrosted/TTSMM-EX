import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { X } from 'lucide-react';
import { createCollectionNameFormSchema, getCollectionNameError, type CollectionNameFormValues } from 'renderer/collection-form-validation';

export type CollectionNamingModalType = 'new-collection' | 'duplicate-collection' | 'rename-collection';

const collectionNamingFocusClassName =
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const collectionNamingButtonClassName = [
	'inline-flex min-h-control cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3.5 font-[650] text-text',
	'enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]',
	'disabled:cursor-not-allowed disabled:opacity-55',
	collectionNamingFocusClassName
].join(' ');
const collectionNamingPrimaryButtonClassName = [
	collectionNamingButtonClassName,
	'border-primary bg-primary enabled:hover:border-primary-hover enabled:hover:bg-primary-hover'
].join(' ');

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
			className="fixed inset-0 z-[1000] flex items-center justify-center bg-[color-mix(in_srgb,var(--app-color-background)_72%,transparent)] p-6"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					closeModal();
				}
			}}
		>
			<section
				aria-labelledby="collection-naming-modal-title"
				aria-modal="true"
				className="flex w-[min(520px,100%)] flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-[0_16px_36px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)]"
				role="dialog"
			>
				<header className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
					<h2 id="collection-naming-modal-title" className="m-0 text-base font-bold leading-[1.3] text-text">
						{currentModal.title}
					</h2>
					<button
						aria-label="Close collection naming modal"
						className={[
							'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-muted',
							'hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] hover:text-text',
							collectionNamingFocusClassName
						].join(' ')}
						type="button"
						onClick={closeModal}
					>
						<X size={18} aria-hidden="true" />
					</button>
				</header>
				<form className="flex flex-col gap-2 p-4" onSubmit={submitModal}>
					<label id={collectionNameLabelId} className="font-[650] text-text" htmlFor={collectionNameInputId}>
						{currentModal.fieldLabel}
					</label>
					<input
						id={collectionNameInputId}
						className={[
							'box-border min-h-control w-full rounded-md border border-border bg-surface px-3 text-text',
							'aria-[invalid=true]:border-error',
							collectionNamingFocusClassName
						].join(' ')}
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
					<span id={collectionNameHelpId} className="text-[0.9rem] leading-[1.4] text-text-muted">
						{currentModal.fieldHelp}
					</span>
					{currentModalError ? (
						<span id={collectionNameErrorId} className="text-[0.9rem] leading-[1.4] text-error">
							{currentModalError}
						</span>
					) : null}
					<footer className="-mx-4 -mb-4 mt-2 flex items-center justify-end gap-2.5 border-t border-border px-4 py-3.5">
						<button className={collectionNamingButtonClassName} type="button" onClick={closeModal}>
							Cancel
						</button>
						<button className={collectionNamingPrimaryButtonClassName} type="submit" disabled={!!currentModalError || savingCollection}>
							{savingCollection ? (
								<span
									className="h-3.5 w-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
									aria-hidden="true"
								/>
							) : null}
							{currentModal.okText}
						</button>
					</footer>
				</form>
			</section>
		</div>
	);
}

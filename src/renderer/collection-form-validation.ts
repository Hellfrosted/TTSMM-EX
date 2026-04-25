import { z } from 'zod';
import { validateCollectionName } from 'shared/collection-name';
import type { CollectionNamingModalType } from './components/collections/CollectionNamingModal';

interface CollectionNameValidationOptions {
	activeCollectionName?: string;
	allCollectionNames: Set<string>;
	modalType: CollectionNamingModalType;
}

export const collectionNameFormSchema = z.object({
	name: z.string()
});

export type CollectionNameFormValues = z.infer<typeof collectionNameFormSchema>;

export function getCollectionNameError(name: string, options: CollectionNameValidationOptions) {
	const trimmedName = name.trim();
	const validationError = validateCollectionName(trimmedName);
	if (validationError) {
		return validationError;
	}

	if (options.modalType === 'rename-collection' && trimmedName === options.activeCollectionName) {
		return 'Collection name is unchanged';
	}

	if (options.allCollectionNames.has(trimmedName)) {
		return 'A collection with that name already exists';
	}

	return undefined;
}

export function createCollectionNameFormSchema(options: CollectionNameValidationOptions) {
	return collectionNameFormSchema.superRefine((values, context) => {
		const error = getCollectionNameError(values.name, options);
		if (!error) {
			return;
		}

		context.addIssue({
			code: 'custom',
			message: error,
			path: ['name']
		});
	});
}

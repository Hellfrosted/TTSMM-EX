import { collectionNamesEqual, getCollectionNameComparisonKey, validateCollectionName } from 'shared/collection-name';
import { createFormResolver, type FormErrorMap } from './form-resolver';

export type CollectionNamingModalType = 'new-collection' | 'duplicate-collection' | 'rename-collection';

interface CollectionNameValidationOptions {
	activeCollectionName?: string;
	allCollectionNames: Set<string>;
	modalType: CollectionNamingModalType;
}

export interface CollectionNameFormValues {
	name: string;
}

export function getCollectionNameError(name: string, options: CollectionNameValidationOptions) {
	const validationError = validateCollectionName(name);
	if (validationError) {
		return validationError;
	}

	const trimmedName = name.trim();
	if (
		options.modalType === 'rename-collection' &&
		options.activeCollectionName &&
		collectionNamesEqual(trimmedName, options.activeCollectionName)
	) {
		return 'Collection name is unchanged';
	}

	const normalizedName = getCollectionNameComparisonKey(trimmedName);
	const collectionNameExists = [...options.allCollectionNames].some(
		(collectionName) => getCollectionNameComparisonKey(collectionName) === normalizedName
	);
	if (collectionNameExists) {
		return 'A collection with that name already exists';
	}

	return undefined;
}

export function createCollectionNameResolver(options: CollectionNameValidationOptions) {
	return createFormResolver<CollectionNameFormValues>((values): FormErrorMap => {
		const error = getCollectionNameError(values.name, options);
		if (!error) {
			return {};
		}

		return { name: error };
	});
}

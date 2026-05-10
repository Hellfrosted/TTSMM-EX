const WINDOWS_RESERVED_COLLECTION_NAMES = new Set([
	'CON',
	'PRN',
	'AUX',
	'NUL',
	'COM1',
	'COM2',
	'COM3',
	'COM4',
	'COM5',
	'COM6',
	'COM7',
	'COM8',
	'COM9',
	'LPT1',
	'LPT2',
	'LPT3',
	'LPT4',
	'LPT5',
	'LPT6',
	'LPT7',
	'LPT8',
	'LPT9'
]);

const INVALID_COLLECTION_NAME_PATTERN = /[<>:"/\\|?*]/;

export function validateCollectionName(name: string): string | undefined {
	if (name.trim().length === 0) {
		return 'Collection name cannot be empty';
	}

	if (name !== name.trim()) {
		return 'Collection name cannot start or end with whitespace';
	}

	if (name === '.' || name === '..') {
		return 'Collection name cannot be a relative path';
	}

	if (name.endsWith('.') || name.endsWith(' ')) {
		return 'Collection name cannot end with a dot or space';
	}

	if (INVALID_COLLECTION_NAME_PATTERN.test(name) || [...name].some((character) => character.charCodeAt(0) < 32)) {
		return 'Collection name cannot contain path separators or reserved characters';
	}

	if (WINDOWS_RESERVED_COLLECTION_NAMES.has(name.toUpperCase())) {
		return 'Collection name cannot use a reserved Windows device name';
	}

	return undefined;
}

export function isValidCollectionName(name: string): boolean {
	return validateCollectionName(name) === undefined;
}

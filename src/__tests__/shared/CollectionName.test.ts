import { describe, expect, it } from 'vitest';
import { collectionNamesEqual, isValidCollectionName, validateCollectionName } from '../../shared/collection-name';

describe('collection name validation', () => {
	it.each([
		['', 'Collection name cannot be empty'],
		['   ', 'Collection name cannot be empty'],
		[' default', 'Collection name cannot start or end with whitespace'],
		['default ', 'Collection name cannot start or end with whitespace'],
		['.', 'Collection name cannot be a relative path'],
		['..', 'Collection name cannot be a relative path'],
		['default.', 'Collection name cannot end with a dot or space'],
		['default/name', 'Collection name cannot contain path separators or reserved characters'],
		['default\\name', 'Collection name cannot contain path separators or reserved characters'],
		['default\u0001name', 'Collection name cannot contain path separators or reserved characters']
	])('rejects invalid collection name %j', (name, error) => {
		expect(validateCollectionName(name)).toBe(error);
		expect(isValidCollectionName(name)).toBe(false);
	});

	it('rejects reserved Windows device names even when they include an extension', () => {
		expect(validateCollectionName('CON.txt')).toBe('Collection name cannot use a reserved Windows device name');
		expect(validateCollectionName('nul.json')).toBe('Collection name cannot use a reserved Windows device name');
		expect(validateCollectionName('COM1.profile')).toBe('Collection name cannot use a reserved Windows device name');
		expect(isValidCollectionName('Console.txt')).toBe(true);
	});

	it('compares collection names case-insensitively for saved-name ownership checks', () => {
		expect(collectionNamesEqual('Default', 'default')).toBe(true);
		expect(collectionNamesEqual('Default', 'default copy')).toBe(false);
	});
});

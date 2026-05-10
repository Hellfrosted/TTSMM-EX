import { describe, expect, it } from 'vitest';
import { isValidCollectionName, validateCollectionName } from '../../shared/collection-name';

describe('collection name validation', () => {
	it('rejects reserved Windows device names even when they include an extension', () => {
		expect(validateCollectionName('CON.txt')).toBe('Collection name cannot use a reserved Windows device name');
		expect(validateCollectionName('nul.json')).toBe('Collection name cannot use a reserved Windows device name');
		expect(validateCollectionName('COM1.profile')).toBe('Collection name cannot use a reserved Windows device name');
		expect(isValidCollectionName('Console.txt')).toBe(true);
	});
});

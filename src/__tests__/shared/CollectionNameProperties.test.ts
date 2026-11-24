import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { collectionNamesEqual, getCollectionNameComparisonKey, isValidCollectionName } from '../../shared/collection-name';

const validName = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,30}$/).filter(isValidCollectionName);

describe('collection name properties', () => {
	it('name equality is reflexive, symmetric and transitive', () => {
		fc.assert(
			fc.property(validName, validName, validName, (a, b, c) => {
				expect(collectionNamesEqual(a, a)).toBe(true);
				expect(collectionNamesEqual(a, b)).toBe(collectionNamesEqual(b, a));
				if (collectionNamesEqual(a, b) && collectionNamesEqual(b, c)) {
					expect(collectionNamesEqual(a, c)).toBe(true);
				}
			})
		);
	});

	it('the comparison key is stable and case-insensitive', () => {
		fc.assert(
			fc.property(validName, (name) => {
				const key = getCollectionNameComparisonKey(name);
				expect(key).toBe(getCollectionNameComparisonKey(name));
				expect(key).toBe(name.toLowerCase());
			})
		);
	});

	it('reserved Windows device names are never valid', () => {
		fc.assert(
			fc.property(fc.constantFrom('CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9'), (reserved) => {
				expect(isValidCollectionName(reserved)).toBe(false);
				expect(isValidCollectionName(`${reserved}.txt`)).toBe(false);
			})
		);
	});
});

import { describe, expect, it } from 'vitest';
import { getCollectionNameError } from '../../renderer/collection-form-validation';

describe('collection form validation', () => {
	it('validates the raw collection name before duplicate and unchanged checks', () => {
		const options = {
			activeCollectionName: 'default',
			allCollectionNames: new Set(['default']),
			modalType: 'rename-collection' as const
		};

		expect(getCollectionNameError(' default ', options)).toBe('Collection name cannot start or end with whitespace');
		expect(getCollectionNameError('default', options)).toBe('Collection name is unchanged');
		expect(getCollectionNameError('Default', options)).toBe('Collection name is unchanged');
	});

	it('uses the shared collection-name equivalence rule for duplicate preflight', () => {
		expect(
			getCollectionNameError('Default', {
				allCollectionNames: new Set(['default']),
				modalType: 'new-collection'
			})
		).toBe('A collection with that name already exists');
	});
});

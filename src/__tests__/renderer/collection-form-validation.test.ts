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
	});
});

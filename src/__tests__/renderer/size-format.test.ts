import { describe, expect, it } from 'vitest';
import { formatSizeLabel } from '../../renderer/components/collections/main-collection-table-layout';

describe('formatSizeLabel', () => {
	it('rounds without creating extra digits and carries into the next unit', () => {
		expect(formatSizeLabel(999)).toBe('999 B');
		expect(formatSizeLabel(1024)).toBe('1.02 KB');
		expect(formatSizeLabel(9999)).toBe('10.0 KB');
		expect(formatSizeLabel(999500)).toBe('1.00 MB');
	});
});

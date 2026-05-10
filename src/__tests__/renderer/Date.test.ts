import { describe, expect, it } from 'vitest';

import { formatDateStr } from '../../util/Date';

describe('formatDateStr', () => {
	it('formats local dates with the collection timestamp shape', () => {
		expect(formatDateStr(new Date(2024, 0, 2, 3, 4))).toBe('2024-01-02 03:04');
	});

	it('returns an empty string for missing or zero dates', () => {
		expect(formatDateStr(undefined)).toBe('');
		expect(formatDateStr(new Date(0))).toBe('');
	});

	it('rejects invalid dates', () => {
		expect(() => formatDateStr(new Date(Number.NaN))).toThrow(TypeError);
	});
});

import { formatErrorMessage } from 'renderer/util/error-message';
import { describe, expect, it } from 'vitest';

describe('formatErrorMessage', () => {
	it('uses plain Error messages', () => {
		expect(formatErrorMessage(new Error('Clipboard denied'))).toBe('Clipboard denied');
	});

	it('extracts messages from object-shaped IPC errors', () => {
		expect(formatErrorMessage({ code: 'EACCES', message: 'Path is not writable' })).toBe('Path is not writable');
	});

	it('extracts nested messages from object-shaped IPC errors', () => {
		expect(formatErrorMessage({ status: 500, error: { reason: 'Steam offline' } })).toBe('Steam offline');
	});

	it('serializes unknown object errors instead of showing object Object', () => {
		expect(formatErrorMessage({ status: 500, values: ['steam', 'offline'] })).toBe('{"status":500,"values":["steam","offline"]}');
	});

	it('falls back when no useful message is available', () => {
		expect(formatErrorMessage(null)).toBe('The app received an unexpected error response.');
	});
});

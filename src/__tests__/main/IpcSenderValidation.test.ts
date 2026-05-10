import { describe, expect, it } from 'vitest';
import { assertValidIpcSender, isValidIpcSender } from '../../main/ipc/ipc-sender-validation';
import { ValidChannel } from '../../shared/ipc';

describe('IPC sender validation', () => {
	const rendererUrl = 'http://localhost:1212/index.html';

	it('accepts app renderer IPC calls', () => {
		expect(isValidIpcSender({ senderFrame: { url: 'http://localhost:1212/index.html' } }, { rendererUrl })).toBe(true);
		expect(isValidIpcSender({ senderFrame: { url: 'http://localhost:1212/' } }, { rendererUrl })).toBe(true);
	});

	it('accepts packaged renderer file URLs with hash routing', () => {
		const packagedRendererUrl = 'file:///C:/app/release/app/dist/renderer/index.html';

		expect(
			isValidIpcSender(
				{
					senderFrame: {
						url: 'file:///C:/app/release/app/dist/renderer/index.html#/collections/default'
					}
				},
				{ rendererUrl: packagedRendererUrl }
			)
		).toBe(true);
	});

	it('rejects unexpected origins', () => {
		expect(isValidIpcSender({ senderFrame: { url: 'https://example.com/index.html' } }, { rendererUrl })).toBe(false);
		expect(() =>
			assertValidIpcSender(ValidChannel.READ_CONFIG, { senderFrame: { url: 'https://example.com/index.html' } }, { rendererUrl })
		).toThrow('Rejected IPC sender for read-config');
	});

	it('rejects missing frame metadata', () => {
		expect(isValidIpcSender({ senderFrame: null }, { rendererUrl })).toBe(false);
		expect(() => assertValidIpcSender(ValidChannel.READ_CONFIG, {}, { rendererUrl })).toThrow('Rejected IPC sender for read-config');
	});
});

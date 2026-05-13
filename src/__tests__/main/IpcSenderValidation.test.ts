import { Effect } from 'effect';
import type { IpcMain } from 'electron';
import { describe, expect, it } from 'vitest';
import { registerValidatedEffectIpcHandler } from '../../main/ipc/ipc-handler';
import { assertValidIpcSender, isValidIpcSender } from '../../main/ipc/ipc-sender-validation';
import { ValidChannel } from '../../shared/ipc';
import { createValidIpcEvent } from './test-utils';

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

	it('runs Effect handlers after sender validation and maps Effect failures to rejected invokes', async () => {
		const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
		const ipcMain = {
			handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
				handlers.set(channel, handler);
			}
		} as IpcMain;
		const event = createValidIpcEvent();

		registerValidatedEffectIpcHandler(ipcMain, ValidChannel.READ_CONFIG, (_event, value: string) => Effect.succeed(`ok:${value}`));
		await expect(handlers.get(ValidChannel.READ_CONFIG)?.(event, 'payload')).resolves.toBe('ok:payload');
		await expect(
			handlers.get(ValidChannel.READ_CONFIG)?.({ senderFrame: { url: 'https://example.com/index.html' } }, 'payload')
		).rejects.toThrow('Rejected IPC sender for read-config');

		registerValidatedEffectIpcHandler(ipcMain, ValidChannel.UPDATE_CONFIG, () => Effect.fail(new Error('effect failed')));
		await expect(handlers.get(ValidChannel.UPDATE_CONFIG)?.(event)).rejects.toThrow('effect failed');
	});
});

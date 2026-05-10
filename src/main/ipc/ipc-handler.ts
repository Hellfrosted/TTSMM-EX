import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import type { ValidChannel } from '../../model';
import { assertValidIpcSender } from './ipc-sender-validation';

export function registerValidatedIpcHandler<TArgs extends unknown[], TResult>(
	ipcMain: IpcMain,
	channel: ValidChannel,
	handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult
) {
	ipcMain.handle(channel, async (event, ...args: TArgs) => {
		assertValidIpcSender(channel, event);
		return handler(event, ...args);
	});
}

export function registerValidatedIpcListener<TArgs extends unknown[]>(
	ipcMain: IpcMain,
	channel: ValidChannel,
	listener: (event: IpcMainEvent, ...args: TArgs) => void
) {
	ipcMain.on(channel, (event, ...args: TArgs) => {
		assertValidIpcSender(channel, event);
		listener(event, ...args);
	});
}

import { vi } from 'vitest';

export const contextBridge = {
	exposeInMainWorld: vi.fn()
};

export const ipcRenderer = {
	on: vi.fn(),
	removeListener: vi.fn(),
	send: vi.fn(),
	invoke: vi.fn()
};

import { vi } from 'vitest';

export const shell = {
	openExternal: vi.fn(),
	openPath: vi.fn(async () => '')
};

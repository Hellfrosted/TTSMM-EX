import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHtmlPath } from '../../main/util';

afterEach(() => vi.unstubAllEnvs());

describe('resolveHtmlPath', () => {
	it('uses the development renderer origin', () => {
		vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/');
		expect(resolveHtmlPath('index.html')).toBe('http://localhost:5173/index.html');
	});

	it('reports an invalid development renderer URL', () => {
		vi.stubEnv('ELECTRON_RENDERER_URL', 'not a URL');
		expect(() => resolveHtmlPath('index.html')).toThrow('ELECTRON_RENDERER_URL must be an absolute URL.');
	});
});

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizePathValue, parseSteamLibraryFolders } from '../../main/path-utils';

describe('path normalization', () => {
	it('preserves network paths supplied by the user', () => {
		const networkPath = String.raw`\\server\share\Steam`;
		expect(normalizePathValue(networkPath)).toBe(path.normalize(networkPath));
	});

	it('decodes escaped backslashes in Steam library folders', () => {
		const networkPath = String.raw`\\server\share\Steam`;
		const escaped = networkPath.replace(/\\/g, '\\\\');
		expect(parseSteamLibraryFolders(`"path" "${escaped}"`)).toEqual([path.normalize(networkPath)]);
	});
});

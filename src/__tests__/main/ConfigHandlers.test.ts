import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readConfigFile } from '../../main/ipc/config-handlers';
import { createTempDir } from './test-utils';

describe('config handlers', () => {
	it('returns null for a missing config file', () => {
		const tempDir = createTempDir('ttsmm-config-test-');

		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toBeNull();
	});

	it('throws when the config file exists but contains malformed json', () => {
		const tempDir = createTempDir('ttsmm-config-test-');
		const configPath = path.join(tempDir, 'config.json');
		fs.writeFileSync(configPath, '{ bad json', 'utf8');

		expect(() => readConfigFile(configPath, true)).toThrow(`Failed to load config file "${configPath}"`);
	});
});

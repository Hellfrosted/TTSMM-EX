import path from 'path';
import { describe, expect, it } from 'vitest';
import { readConfigFile } from '../../main/ipc/config-handlers';
import { createTempDir } from './test-utils';

describe('config handlers', () => {
	it('returns null for a missing config file', () => {
		const tempDir = createTempDir('ttsmm-config-test-');

		expect(readConfigFile(path.join(tempDir, 'config.json'), true)).toBeNull();
	});
});

// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkNativeDependencies, runNativeDependencyCheckCli } from '../../../scripts/check-native-dep';

describe('check-native-dep', () => {
	let tempDir: string;

	afterEach(() => {
		if (tempDir) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('detects scoped native dependencies installed at the repo root', () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-native-dep-check-'));
		fs.mkdirSync(path.join(tempDir, 'node_modules', '@scope', 'native-addon'), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, 'package.json'),
			JSON.stringify({
				dependencies: {
					'@scope/native-addon': '^1.0.0'
				}
			}),
			'utf8'
		);
		fs.writeFileSync(path.join(tempDir, 'node_modules', '@scope', 'native-addon', 'binding.gyp'), '{}', 'utf8');
		const log = vi.fn();

		expect(checkNativeDependencies({ rootDir: tempDir, log })).toBe(1);
		expect(log).toHaveBeenCalledOnce();
	});

	it('returns a non-zero exit code when the CLI wrapper cannot read package.json', () => {
		const log = vi.fn();

		expect(
			runNativeDependencyCheckCli({
				log,
				readFileSync: (() => {
					throw new Error('read failed');
				}) as typeof fs.readFileSync
			})
		).toBe(1);
		expect(log).toHaveBeenCalledWith('Native dependencies could not be checked');
	});
});

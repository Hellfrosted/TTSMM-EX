// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkNativeDependencies, runNativeDependencyCheckCli } from '../../../scripts/check-native-dep';

describe('check-native-dep', () => {
	let tempDir: string;

	function createPackageRoot(dependencies?: Record<string, string>) {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-native-dep-check-'));
		fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ dependencies }), 'utf8');
		return tempDir;
	}

	function addBindingGyp(rootDir: string, dependencyName: string) {
		const dependencyDir = path.join(rootDir, 'node_modules', ...dependencyName.split('/'));
		fs.mkdirSync(dependencyDir, { recursive: true });
		fs.writeFileSync(path.join(dependencyDir, 'binding.gyp'), '{}', 'utf8');
	}

	afterEach(() => {
		if (tempDir) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('accepts packages without root dependencies', () => {
		const rootDir = createPackageRoot();
		const log = vi.fn();

		expect(checkNativeDependencies({ rootDir, log })).toBe(0);
		expect(log).not.toHaveBeenCalled();
	});

	it('accepts non-native dependencies installed at the repo root', () => {
		const rootDir = createPackageRoot({ plain: '^1.0.0' });
		fs.mkdirSync(path.join(rootDir, 'node_modules', 'plain'), { recursive: true });
		const log = vi.fn();

		expect(checkNativeDependencies({ rootDir, log })).toBe(0);
		expect(log).not.toHaveBeenCalled();
	});

	it('detects scoped native dependencies installed at the repo root', () => {
		const rootDir = createPackageRoot({ '@scope/native-addon': '^1.0.0' });
		addBindingGyp(rootDir, '@scope/native-addon');
		const log = vi.fn();

		expect(checkNativeDependencies({ rootDir, log })).toBe(1);
		expect(log).toHaveBeenCalledOnce();
	});

	it('detects unscoped native dependencies and reports every root native package', () => {
		const rootDir = createPackageRoot({
			'@scope/native-addon': '^1.0.0',
			'native-addon': '^2.0.0'
		});
		addBindingGyp(rootDir, '@scope/native-addon');
		addBindingGyp(rootDir, 'native-addon');
		const log = vi.fn();

		expect(checkNativeDependencies({ rootDir, log })).toBe(1);
		expect(log).toHaveBeenCalledOnce();
		expect(log.mock.calls[0]?.[0]).toContain('@scope/native-addon, native-addon');
		expect(log.mock.calls[0]?.[0]).toContain('are native dependencies');
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

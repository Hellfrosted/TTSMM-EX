// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createExtractCommand,
	getElectronBinaryPaths,
	getElectronExecutableName,
	isElectronBinaryReady
} from '../../../scripts/ensure-electron-binary';

describe('ensure-electron-binary', () => {
	it('resolves the Electron executable name for supported CI platforms', () => {
		expect(getElectronExecutableName('linux')).toBe('electron');
		expect(getElectronExecutableName('win32')).toBe('electron.exe');
		expect(getElectronExecutableName('darwin')).toBe('Electron.app/Contents/MacOS/Electron');
	});

	it('detects a complete Electron binary install', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-electron-binary-'));
		try {
			const paths = getElectronBinaryPaths(tempDir, 'linux');

			expect(isElectronBinaryReady(paths)).toBe(false);

			fs.mkdirSync(paths.distDir, { recursive: true });
			fs.writeFileSync(paths.pathFile, paths.executableName);
			fs.writeFileSync(paths.executablePath, '');

			expect(isElectronBinaryReady(paths)).toBe(true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('uses platform-native archive extraction commands', () => {
		expect(createExtractCommand('linux', '/cache/electron.zip', '/app/electron/dist')).toEqual({
			args: ['-oq', '/cache/electron.zip', '-d', '/app/electron/dist'],
			command: 'unzip'
		});
		expect(createExtractCommand('win32', 'C:\\cache\\electron.zip', 'C:\\app\\electron\\dist')).toEqual({
			args: [
				'-NoProfile',
				'-Command',
				'Expand-Archive',
				'-LiteralPath',
				'C:\\cache\\electron.zip',
				'-DestinationPath',
				'C:\\app\\electron\\dist',
				'-Force'
			],
			command: 'powershell'
		});
	});
});

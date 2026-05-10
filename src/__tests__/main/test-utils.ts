import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach } from 'vitest';
import { resolveHtmlPath } from '../../main/util';

const tempDirs = new Set<string>();

export function createTempDir(prefix: string) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.add(tempDir);
	return tempDir;
}

afterEach(() => {
	for (const tempDir of tempDirs) {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
	tempDirs.clear();
});

export function createValidIpcEvent() {
	return {
		senderFrame: {
			url: resolveHtmlPath('index.html')
		}
	};
}

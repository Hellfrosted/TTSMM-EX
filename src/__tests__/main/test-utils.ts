import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveHtmlPath } from '../../main/util';

export function createTempDir(prefix: string) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function createValidIpcEvent() {
	return {
		senderFrame: {
			url: resolveHtmlPath('index.html')
		}
	};
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isExecutedDirectly(moduleUrl: string, argvScriptPath = process.argv[1]) {
	if (!argvScriptPath) {
		return false;
	}

	return fileURLToPath(moduleUrl) === path.resolve(argvScriptPath);
}

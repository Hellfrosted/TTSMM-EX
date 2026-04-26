import path from 'path';
import type { app } from 'electron';

export const FORK_USER_DATA_DIR = 'TerraTech Steam Mod Manager EX';
export const USER_DATA_DIR_OVERRIDE_ENV = 'TTSMM_EX_USER_DATA_DIR';
const USER_DATA_DIR_OVERRIDE_ARG = '--ttsmm-ex-user-data-dir=';
const USER_DATA_DIR_OVERRIDE_PLAIN_ARG = 'ttsmm-ex-user-data-dir=';

function readArgValue(prefix: string, argv: string[] = process.argv) {
	const arg = argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : undefined;
}

export function resolveUserDataPath(
	appApi: Pick<typeof app, 'getPath'>,
	env: Partial<Record<typeof USER_DATA_DIR_OVERRIDE_ENV, string>> = process.env
) {
	const overridePath =
		env[USER_DATA_DIR_OVERRIDE_ENV] || readArgValue(USER_DATA_DIR_OVERRIDE_ARG) || readArgValue(USER_DATA_DIR_OVERRIDE_PLAIN_ARG);
	if (overridePath) {
		return path.resolve(overridePath);
	}

	return path.join(appApi.getPath('appData'), FORK_USER_DATA_DIR);
}

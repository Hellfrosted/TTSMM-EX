export const UI_SMOKE_ENV = 'TTSMM_EX_UI_SMOKE';
export const UI_SMOKE_OUTPUT_ENV = 'TTSMM_EX_UI_SMOKE_OUTPUT';
export const UI_SMOKE_SCREENSHOT_DIR_ENV = 'TTSMM_EX_UI_SMOKE_SCREENSHOT_DIR';
export const UI_SMOKE_ARG = '--ttsmm-ex-ui-smoke';
export const UI_SMOKE_OUTPUT_ARG = '--ttsmm-ex-ui-smoke-output=';
export const UI_SMOKE_SCREENSHOT_DIR_ARG = '--ttsmm-ex-ui-smoke-screenshot-dir=';
export const UI_SMOKE_PLAIN_ARG = 'ttsmm-ex-ui-smoke';
export const UI_SMOKE_OUTPUT_PLAIN_ARG = 'ttsmm-ex-ui-smoke-output=';
export const UI_SMOKE_SCREENSHOT_DIR_PLAIN_ARG = 'ttsmm-ex-ui-smoke-screenshot-dir=';

export function readPrefixedArgValue(prefix: string, argv: string[]) {
	const arg = argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : undefined;
}

export function isUiSmokeRunRequest(env: Partial<Record<typeof UI_SMOKE_ENV, string>>, argv: string[]) {
	return env[UI_SMOKE_ENV] === '1' || argv.includes(UI_SMOKE_ARG) || argv.includes(UI_SMOKE_PLAIN_ARG);
}

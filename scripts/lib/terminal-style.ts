import { styleText } from 'node:util';

type TerminalStyleFormat = Parameters<typeof styleText>[0];

const paint = (format: TerminalStyleFormat, message: string) => styleText(format, message);

export const terminalStyle = {
	bold: (message: string) => paint('bold', message),
	cyan: (message: string) => paint('cyan', message),
	danger: (message: string) => paint(['whiteBright', 'bgRed', 'bold'], message),
	error: (message: string) => paint('red', message),
	success: (message: string) => paint('green', message),
	successCommand: (message: string) => paint(['whiteBright', 'bgGreen', 'bold'], message),
	warning: (message: string) => paint('yellow', message),
	warningBanner: (message: string) => paint(['whiteBright', 'bgYellow', 'bold'], message)
};

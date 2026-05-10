import detectPortFn from 'detect-port';
import { terminalStyle } from './lib/terminal-style';

const port = process.env.PORT || '1212';

detectPortFn(port, (error, availablePort) => {
	if (error) {
		throw error;
	}

	if (port !== String(availablePort)) {
		throw new Error(
			terminalStyle.danger(`Port "${port}" on "localhost" is already in use. Please use another port. ex: PORT=4343 pnpm run dev`)
		);
	}

	process.exit(0);
});

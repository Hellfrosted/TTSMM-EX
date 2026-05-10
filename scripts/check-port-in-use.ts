import chalk from 'chalk';
import detectPortFn from 'detect-port';

const port = process.env.PORT || '1212';

detectPortFn(port, (error, availablePort) => {
	if (error) {
		throw error;
	}

	if (port !== String(availablePort)) {
		throw new Error(
			chalk.whiteBright.bgRed.bold(`Port "${port}" on "localhost" is already in use. Please use another port. ex: PORT=4343 pnpm run dev`)
		);
	}

	process.exit(0);
});

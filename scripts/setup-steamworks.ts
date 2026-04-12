import chalk from 'chalk';
import { resolveSteamworksSdkPath, setupSteamworksNativeDeps } from './steamworks-setup';

try {
	const steamworksSdkPath = resolveSteamworksSdkPath();
	if (!steamworksSdkPath) {
		throw new Error(
			'Steamworks SDK path is not configured. Set STEAMWORKS_SDK_PATH or create a .steamworks-sdk-path file in the repo root.'
		);
	}

	console.log(chalk.cyan('Installing and rebuilding native Steamworks dependencies.'));
	console.log(chalk.cyan(`Using Steamworks SDK at: ${steamworksSdkPath}`));
	setupSteamworksNativeDeps(steamworksSdkPath);
	console.log(chalk.green('Steamworks native dependencies are ready.'));
} catch (error) {
	console.error(chalk.red('Steamworks native dependency setup failed.'));
	console.error(
		chalk.red(
			'Ensure the Steamworks SDK files required by the greenworks fork are available before running "npm run setup:steamworks".'
		)
	);
	throw error;
}

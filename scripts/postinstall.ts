import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { resolveSteamworksSdkPath, setupSteamworksNativeDeps } from './steamworks-setup';

const run = (command: string) => {
	execSync(command, { stdio: 'inherit' });
};

run('node --import=tsx ./scripts/check-native-dep.ts');

if (process.env.TTSMM_SETUP_STEAMWORKS === '1') {
	console.log(chalk.cyan('Setting up native Steamworks dependencies.'));
	const steamworksSdkPath = resolveSteamworksSdkPath();
	if (!steamworksSdkPath) {
		throw new Error('TTSMM_SETUP_STEAMWORKS=1 requires STEAMWORKS_SDK_PATH or .steamworks-sdk-path to be configured.');
	}
	setupSteamworksNativeDeps(steamworksSdkPath);
} else {
	console.log(
		chalk.yellow(
			'Skipping Steamworks native dependency setup. Run "pnpm run setup:steamworks" after installing the Steamworks SDK if you need Steam integration locally.'
		)
	);
}

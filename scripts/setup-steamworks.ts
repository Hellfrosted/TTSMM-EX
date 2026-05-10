import { resolveSteamworksSdkPath, setupSteamworksNativeDeps } from './steamworks-setup';
import { terminalStyle } from './lib/terminal-style';

try {
	const steamworksSdkPath = resolveSteamworksSdkPath();
	if (!steamworksSdkPath) {
		throw new Error(
			'Steamworks SDK path is not configured. Set STEAMWORKS_SDK_PATH or create a .steamworks-sdk-path file in the repo root.'
		);
	}

	console.log(terminalStyle.cyan('Installing and rebuilding native Steamworks dependencies.'));
	console.log(terminalStyle.cyan(`Using Steamworks SDK at: ${steamworksSdkPath}`));
	setupSteamworksNativeDeps(steamworksSdkPath);
	console.log(terminalStyle.success('Steamworks native dependencies are ready.'));
} catch (error) {
	console.error(terminalStyle.error('Steamworks native dependency setup failed.'));
	console.error(
		terminalStyle.error(
			'Ensure the Steamworks SDK files required by the greenworks fork are available before running "pnpm run setup:steamworks".'
		)
	);
	throw error;
}

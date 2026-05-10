import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { releaseAppNodeModulesPath, releaseAppPath, repoRoot, srcNodeModulesPath } from './lib/paths';

const sdkPathFile = path.join(repoRoot, '.steamworks-sdk-path');
const greenworksPath = path.join(releaseAppNodeModulesPath, 'greenworks');
const greenworksSdkPath = path.join(greenworksPath, 'deps', 'steamworks_sdk');
const greenworksWorkshopWorkersPath = path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc');
const legacySmokeEntryPath = path.join(os.tmpdir(), 'ttsmm-steamworks-smoke.ts');
const legacySmokeWorkerPath = path.join(os.tmpdir(), 'ttsmm-steamworks-smoke-worker.ts');
const smokeWorkerPath = path.join(repoRoot, 'scripts', '.tmp', 'ttsmm-steamworks-smoke-worker.ts');

export const resolveSteamworksSdkPath = () => {
	if (process.env.STEAMWORKS_SDK_PATH) {
		return process.env.STEAMWORKS_SDK_PATH;
	}

	if (fs.existsSync(sdkPathFile)) {
		const configuredPath = fs.readFileSync(sdkPathFile, 'utf8').trim();
		if (configuredPath.length > 0) {
			return configuredPath;
		}
	}

	return undefined;
};

function validateSteamworksSdkPath(steamworksSdkPath: string) {
	const resolvedSdkPath = path.resolve(steamworksSdkPath);

	if (!fs.existsSync(resolvedSdkPath)) {
		throw new Error(`Steamworks SDK path does not exist: ${resolvedSdkPath}`);
	}

	const stats = fs.statSync(resolvedSdkPath);
	if (!stats.isDirectory()) {
		throw new Error(`Steamworks SDK path is not a directory: ${resolvedSdkPath}`);
	}

	const topLevelEntries = fs.readdirSync(resolvedSdkPath);
	if (topLevelEntries.length === 0) {
		throw new Error(
			[
				`Steamworks SDK path is empty: ${resolvedSdkPath}`,
				'Point STEAMWORKS_SDK_PATH at the extracted sdk directory that contains public and redistributable_bin.'
			].join('\n')
		);
	}

	const requiredPathGroups = [
		['public'],
		['redistributable_bin'],
		[path.join('public', 'steam', 'steam_api.h')]
	];

	if (process.platform === 'win32' && process.arch === 'x64') {
		requiredPathGroups.push(
			[
				path.join('public', 'steam', 'lib', 'win64', 'steam_api64.lib'),
				path.join('redistributable_bin', 'win64', 'steam_api64.lib')
			],
			[path.join('public', 'steam', 'lib', 'win64', 'sdkencryptedappticket64.lib')],
			[path.join('public', 'steam', 'lib', 'win64', 'sdkencryptedappticket64.dll')],
			[path.join('redistributable_bin', 'win64', 'steam_api64.dll')]
		);
	}

	const missingPaths = requiredPathGroups
		.map((candidatePaths) => {
			const foundPath = candidatePaths.find((candidatePath) => fs.existsSync(path.join(resolvedSdkPath, candidatePath)));
			if (foundPath) {
				return null;
			}

			return candidatePaths[0]!;
		})
		.filter((relativePath): relativePath is string => Boolean(relativePath));

	if (missingPaths.length > 0) {
		throw new Error(
			[
				`Steamworks SDK path is missing required files for the current platform: ${resolvedSdkPath}`,
				...missingPaths.map((relativePath) => `- ${relativePath}`)
			].join('\n')
		);
	}
}

const run = (command: string, env?: NodeJS.ProcessEnv, cwd = repoRoot) => {
	execSync(command, {
		cwd,
		stdio: 'inherit',
		env: {
			...process.env,
			...env
		}
	});
};

function removeIfExists(targetPath: string) {
	if (fs.existsSync(targetPath)) {
		fs.rmSync(targetPath, { recursive: true, force: true });
	}
}

function ensureGreenworksPresent() {
	if (!fs.existsSync(greenworksPath)) {
		run('npm --prefix release/app install');
	}
}

function stageSteamworksSdkCompat(steamworksSdkPath: string) {
	fs.cpSync(steamworksSdkPath, greenworksSdkPath, { recursive: true });

	// Keep SDK layout compatibility fixes localized here so the rest of the app
	// can treat the staged Steamworks tree as if it matched greenworks' baseline.
	if (process.platform === 'win32' && process.arch === 'x64') {
		const expectedImportLibPath = path.join(greenworksSdkPath, 'public', 'steam', 'lib', 'win64', 'steam_api64.lib');
		const redistributableImportLibPath = path.join(greenworksSdkPath, 'redistributable_bin', 'win64', 'steam_api64.lib');

		if (!fs.existsSync(expectedImportLibPath) && fs.existsSync(redistributableImportLibPath)) {
			fs.mkdirSync(path.dirname(expectedImportLibPath), { recursive: true });
			fs.copyFileSync(redistributableImportLibPath, expectedImportLibPath);
		}
	}
}

function patchGreenworksWorkshopWorkerSource() {
	if (!fs.existsSync(greenworksWorkshopWorkersPath)) {
		return;
	}

	const source = fs.readFileSync(greenworksWorkshopWorkersPath, 'utf8');
	const patchedSource = source.replace(
		'char *PreviewTypeToString(EItemPreviewType type) {',
		'const char *PreviewTypeToString(EItemPreviewType type) {'
	);

	if (patchedSource !== source) {
		fs.writeFileSync(greenworksWorkshopWorkersPath, patchedSource);
	}
}

function terminateSteamworksSmokeProcesses() {
	const processFilter = [
		"Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe'",
		`-and ($_.CommandLine -like '*${legacySmokeEntryPath}*'`,
		`-or $_.CommandLine -like '*${legacySmokeWorkerPath}*'`,
		`-or $_.CommandLine -like '*${smokeWorkerPath}*') }`
	].join(' ');
	const stopProcesses = 'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }';
	run(`powershell -NoProfile -Command "${processFilter} | ${stopProcesses}"`);
}

export function stageSteamworksSdk(steamworksSdkPath: string) {
	ensureGreenworksPresent();
	removeIfExists(greenworksSdkPath);
	fs.mkdirSync(path.dirname(greenworksSdkPath), { recursive: true });
	stageSteamworksSdkCompat(steamworksSdkPath);
}

export function linkModules() {
	if (!fs.existsSync(srcNodeModulesPath) && fs.existsSync(releaseAppNodeModulesPath)) {
		fs.symlinkSync(releaseAppNodeModulesPath, srcNodeModulesPath, 'junction');
	}
}

export function setupSteamworksNativeDeps(steamworksSdkPath: string) {
	validateSteamworksSdkPath(steamworksSdkPath);
	terminateSteamworksSmokeProcesses();
	stageSteamworksSdk(steamworksSdkPath);
	patchGreenworksWorkshopWorkerSource();
	run('npm run electron-rebuild', { STEAMWORKS_SDK_PATH: greenworksSdkPath }, releaseAppPath);
	linkModules();
}

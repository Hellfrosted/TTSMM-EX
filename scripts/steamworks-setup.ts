import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { releaseAppNodeModulesPath, releaseAppPath, repoRoot, srcNodeModulesPath } from './lib/paths';

const sdkPathFile = path.join(repoRoot, '.steamworks-sdk-path');
const greenworksPath = path.join(releaseAppNodeModulesPath, 'greenworks');
const greenworksSdkPath = path.join(greenworksPath, 'deps', 'steamworks_sdk');
const greenworksBindingGypPath = path.join(greenworksPath, 'binding.gyp');
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

	if (process.platform === 'linux' && process.arch === 'x64') {
		requiredPathGroups.push(
			[path.join('redistributable_bin', 'linux64', 'libsteam_api.so')],
			[path.join('public', 'steam', 'lib', 'linux64', 'libsdkencryptedappticket.so')]
		);
	}

	if (process.platform === 'linux' && process.arch === 'ia32') {
		requiredPathGroups.push(
			[path.join('redistributable_bin', 'linux32', 'libsteam_api.so')],
			[path.join('public', 'steam', 'lib', 'linux32', 'libsdkencryptedappticket.so')]
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

function pathExistsOrIsDanglingLink(targetPath: string) {
	try {
		fs.lstatSync(targetPath);
		return true;
	} catch {
		return false;
	}
}

function ensureGreenworksPresent() {
	if (!fs.existsSync(greenworksPath)) {
		run('npm --prefix release/app install --ignore-scripts');
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
	const patchedSource = source
		.replace('const const char *PreviewTypeToString(EItemPreviewType type) {', 'const char *PreviewTypeToString(EItemPreviewType type) {')
		.replace(
			/(^|\n)char \*PreviewTypeToString\(EItemPreviewType type\) \{/,
			'$1const char *PreviewTypeToString(EItemPreviewType type) {'
		);

	if (patchedSource !== source) {
		fs.writeFileSync(greenworksWorkshopWorkersPath, patchedSource);
	}
}

function patchGreenworksPythonCommand() {
	if (process.platform === 'win32' || !fs.existsSync(greenworksBindingGypPath)) {
		return;
	}

	const source = fs.readFileSync(greenworksBindingGypPath, 'utf8');
	const patchedSource = source.replace("'python',", "'python3',");

	if (patchedSource !== source) {
		fs.writeFileSync(greenworksBindingGypPath, patchedSource);
	}
}

function terminateSteamworksSmokeProcesses() {
	if (process.platform !== 'win32') {
		const smokePathFragments = [legacySmokeEntryPath, legacySmokeWorkerPath, smokeWorkerPath].map((targetPath) => targetPath.replace(/\\/g, '/'));
		const processList = execSync('ps -ax -o pid= -o command=', {
			cwd: repoRoot,
			encoding: 'utf8'
		});
		const matchingPids = processList
			.split(/\r?\n/)
			.map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
			.filter((match): match is RegExpMatchArray => Boolean(match))
			.filter(([, , commandLine]) => {
				const normalizedCommandLine = commandLine.toLowerCase().replace(/\\/g, '/');
				return normalizedCommandLine.includes('electron') && smokePathFragments.some((fragment) => normalizedCommandLine.includes(fragment.toLowerCase()));
			})
			.map(([, pid]) => Number.parseInt(pid, 10))
			.filter((pid) => Number.isInteger(pid) && pid > 0);

		matchingPids.forEach((pid) => {
			try {
				process.kill(pid, 'SIGKILL');
			} catch {
				// Ignore races where the smoke-test process exits after enumeration.
			}
		});
		return;
	}

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
	if (!fs.existsSync(releaseAppNodeModulesPath)) {
		return;
	}

	if (pathExistsOrIsDanglingLink(srcNodeModulesPath)) {
		try {
			const currentStats = fs.lstatSync(srcNodeModulesPath);
			if (currentStats.isSymbolicLink()) {
				const currentTarget = path.normalize(fs.realpathSync.native(srcNodeModulesPath));
				const expectedTarget = path.normalize(fs.realpathSync.native(releaseAppNodeModulesPath));
				if (currentTarget === expectedTarget) {
					return;
				}
			} else {
				return;
			}
		} catch {
			// Remove stale or dangling junctions so setup can recreate them.
		}

		fs.rmSync(srcNodeModulesPath, { recursive: true, force: true });
	}

	fs.symlinkSync(releaseAppNodeModulesPath, srcNodeModulesPath, 'junction');
}

export function setupSteamworksNativeDeps(steamworksSdkPath: string) {
	validateSteamworksSdkPath(steamworksSdkPath);
	terminateSteamworksSmokeProcesses();
	stageSteamworksSdk(steamworksSdkPath);
	patchGreenworksWorkshopWorkerSource();
	patchGreenworksPythonCommand();
	run('npm run electron-rebuild', { STEAMWORKS_SDK_PATH: greenworksSdkPath }, releaseAppPath);
	linkModules();
}

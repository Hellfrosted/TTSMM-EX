import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { releaseAppNodeModulesPath, releaseAppPath, repoRoot, srcNodeModulesPath } from './lib/paths';

const sdkPathFile = path.join(repoRoot, '.steamworks-sdk-path');
const greenworksPath = path.join(releaseAppNodeModulesPath, 'greenworks');
const greenworksSdkPath = path.join(greenworksPath, 'deps', 'steamworks_sdk');
const greenworksPackageJsonPath = path.join(greenworksPath, 'package.json');
const greenworksEntrypointPath = path.join(greenworksPath, 'greenworks.js');
const greenworksBindingGypPath = path.join(greenworksPath, 'binding.gyp');
const greenworksWorkshopWorkersPath = path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc');
const smokeWorkerPath = path.join(repoRoot, 'scripts', '.tmp', 'ttsmm-steamworks-smoke-worker.ts');
const v8ExternalPointerTag = 'v8::kExternalPointerTypeTagDefault';

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

	const requiredPathGroups = [['public'], ['redistributable_bin'], [path.join('public', 'steam', 'steam_api.h')]];

	if (process.platform === 'win32' && process.arch === 'x64') {
		requiredPathGroups.push(
			[path.join('public', 'steam', 'lib', 'win64', 'steam_api64.lib'), path.join('redistributable_bin', 'win64', 'steam_api64.lib')],
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

	const missingPaths = requiredPathGroups.flatMap((candidatePaths) => {
		const foundPath = candidatePaths.find((candidatePath) => fs.existsSync(path.join(resolvedSdkPath, candidatePath)));
		if (foundPath) {
			return [];
		}

		return candidatePaths[0] ? [candidatePaths[0]] : [];
	});

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
	if (fs.existsSync(greenworksPackageJsonPath) && fs.existsSync(greenworksEntrypointPath)) {
		return;
	}

	removeIfExists(releaseAppNodeModulesPath);
	run('pnpm --dir release/app install --force --ignore-workspace --ignore-scripts');
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
		.replace(/(^|\n)char \*PreviewTypeToString\(EItemPreviewType type\) \{/, '$1const char *PreviewTypeToString(EItemPreviewType type) {');

	if (patchedSource !== source) {
		fs.writeFileSync(greenworksWorkshopWorkersPath, patchedSource);
	}
}

function resolveGreenworksNanPath() {
	if (!fs.existsSync(greenworksPath)) {
		return undefined;
	}

	const realGreenworksPackageJsonPath = path.join(fs.realpathSync.native(greenworksPath), 'package.json');
	const requireFromGreenworks = createRequire(realGreenworksPackageJsonPath);
	const nanPackageJsonPath = requireFromGreenworks.resolve('nan/package.json');
	return path.dirname(nanPackageJsonPath);
}

function replaceRequiredFileContent(targetPath: string, patch: (source: string) => string) {
	if (!fs.existsSync(targetPath)) {
		throw new Error(`Expected greenworks dependency file does not exist: ${targetPath}`);
	}

	const source = fs.readFileSync(targetPath, 'utf8');
	const patchedSource = patch(source);

	if (patchedSource !== source) {
		fs.writeFileSync(targetPath, patchedSource);
	}
}

function replaceKnownSource(source: string, targetPath: string, search: string, replacement: string) {
	if (source.includes(replacement)) {
		return source;
	}

	if (!source.includes(search)) {
		throw new Error(`Could not find expected greenworks dependency source in ${targetPath}: ${search}`);
	}

	return source.replaceAll(search, replacement);
}

function patchGreenworksNanForV8ExternalPointerTags() {
	const nanPath = resolveGreenworksNanPath();
	if (!nanPath) {
		return;
	}

	const nanHeaderPath = path.join(nanPath, 'nan.h');
	const nanImplementationPath = path.join(nanPath, 'nan_implementation_12_inl.h');
	const nanCallbacksPath = path.join(nanPath, 'nan_callbacks_12_inl.h');

	replaceRequiredFileContent(nanHeaderPath, (source) => {
		const compatDefine = [
			'#if defined(_MSC_VER) && !defined(__clang__) && !defined(__builtin_frame_address)',
			'# define __builtin_frame_address(level) nullptr',
			'#endif',
			''
		].join('\n');

		if (source.includes('# define __builtin_frame_address(level) nullptr')) {
			return source;
		}

		if (!source.includes('#include <node_version.h>\n\n')) {
			throw new Error(`Could not find expected node_version include in ${nanHeaderPath}`);
		}

		return source.replace('#include <node_version.h>\n\n', `#include <node_version.h>\n\n${compatDefine}`);
	});

	replaceRequiredFileContent(nanImplementationPath, (source) => {
		const patchedFactorySource = replaceKnownSource(
			source,
			nanImplementationPath,
			'v8::External::New(v8::Isolate::GetCurrent(), value)',
			`v8::External::New(v8::Isolate::GetCurrent(), value, ${v8ExternalPointerTag})`
		);
		return replaceKnownSource(
			patchedFactorySource,
			nanImplementationPath,
			'v8::External::New(isolate, reinterpret_cast<void *>(callback))',
			`v8::External::New(isolate, reinterpret_cast<void *>(callback), ${v8ExternalPointerTag})`
		);
	});

	replaceRequiredFileContent(nanCallbacksPath, (source) =>
		replaceKnownSource(source, nanCallbacksPath, '.As<v8::External>()->Value())', `.As<v8::External>()->Value(${v8ExternalPointerTag}))`)
	);
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
		const smokePathFragment = smokeWorkerPath.replace(/\\/g, '/').toLowerCase();
		const processList = execSync('ps -ax -o pid= -o command=', {
			cwd: repoRoot,
			encoding: 'utf8'
		});
		const matchingPids = processList.split(/\r?\n/).flatMap((line) => {
			const match = line.match(/^\s*(\d+)\s+(.*)$/);
			if (!match) {
				return [];
			}
			const [, pid, commandLine] = match;
			const normalizedCommandLine = commandLine.toLowerCase().replace(/\\/g, '/');
			if (!normalizedCommandLine.includes('electron') || !normalizedCommandLine.includes(smokePathFragment)) {
				return [];
			}
			const parsedPid = Number.parseInt(pid, 10);
			return Number.isInteger(parsedPid) && parsedPid > 0 ? [parsedPid] : [];
		});

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
		`-and $_.CommandLine -like '*${smokeWorkerPath}*' }`
	].join(' ');
	const stopProcesses = 'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }';
	run(`powershell -NoProfile -Command "${processFilter} | ${stopProcesses}"`);
}

function stageSteamworksSdk(steamworksSdkPath: string) {
	ensureGreenworksPresent();
	removeIfExists(greenworksSdkPath);
	fs.mkdirSync(path.dirname(greenworksSdkPath), { recursive: true });
	stageSteamworksSdkCompat(steamworksSdkPath);
}

// fallow-ignore-next-line unused-export
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
	patchGreenworksNanForV8ExternalPointerTags();
	run('pnpm run rebuild:electron', { STEAMWORKS_SDK_PATH: greenworksSdkPath }, releaseAppPath);
	linkModules();
}

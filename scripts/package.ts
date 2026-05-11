import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { copyGreenworksRuntime } from './lib/greenworks-runtime';
import { runPackageManager } from './lib/package-manager';
import { repoRoot } from './lib/paths';
import { cleanReleaseArtifacts } from './lib/release';
import { terminalStyle } from './lib/terminal-style';

type PublishMode = 'never' | 'onTagOrDraft';

const builderCliPath = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const releaseAppPath = path.join(repoRoot, 'release', 'app');
const packageAppPath = path.join(repoRoot, 'release', 'package-app');
const releaseAppGreenworksPath = path.join(releaseAppPath, 'node_modules', 'greenworks');
const supportedPublishModes = new Set<PublishMode>(['never', 'onTagOrDraft']);
const supportedLinuxTargets = new Set(['deb', 'pacman']);

const printUsage = () => {
	console.log(`Usage:
  pnpm run package
  pnpm run publish
  pnpm run package:linux
  pnpm run package:linux -- deb
  pnpm run package:linux -- pacman`);
};

const runElectronBuilder = (args: string[]) => {
	execFileSync(process.execPath, [builderCliPath, ...args], {
		cwd: repoRoot,
		stdio: 'inherit'
	});
};

const removeIfExists = (targetPath: string) => {
	fs.rmSync(targetPath, { force: true, recursive: true });
};

const linkDirectory = (sourcePath: string, targetPath: string) => {
	removeIfExists(targetPath);
	fs.symlinkSync(sourcePath, targetPath, 'junction');
};

const copyFile = (sourcePath: string, targetPath: string) => {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.copyFileSync(sourcePath, targetPath);
};

const sanitizePackageAppLock = () => {
	const packageLockPath = path.join(packageAppPath, 'node_modules', '.package-lock.json');
	if (!fs.existsSync(packageLockPath)) {
		return;
	}

	const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8')) as {
		packages?: Record<string, { dependencies?: Record<string, string>; hasInstallScript?: boolean }>;
	};
	const greenworksPackage = packageLock.packages?.['node_modules/greenworks'];
	if (greenworksPackage) {
		delete greenworksPackage.dependencies;
		delete greenworksPackage.hasInstallScript;
	}
	delete packageLock.packages?.['node_modules/nan'];
	fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
};

const ensureReleaseAppDependencies = () => {
	if (fs.existsSync(path.join(releaseAppPath, 'node_modules'))) {
		return;
	}

	runPackageManager(['--dir', 'release/app', 'install', '--ignore-workspace', '--ignore-scripts']);
};

const assertSteamworksNativeDepsReady = () => {
	ensureReleaseAppDependencies();
	if (!fs.existsSync(path.join(releaseAppGreenworksPath, 'package.json'))) {
		return;
	}

	const steamApiHeaderPath = path.join(releaseAppGreenworksPath, 'deps', 'steamworks_sdk', 'public', 'steam', 'steam_api.h');
	if (fs.existsSync(steamApiHeaderPath)) {
		return;
	}

	throw new Error(
		[
			'Steamworks SDK headers are missing from release/app Greenworks.',
			'Run "pnpm run setup:steamworks" after configuring STEAMWORKS_SDK_PATH or .steamworks-sdk-path, then run packaging again.',
			`Missing: ${path.relative(repoRoot, steamApiHeaderPath)}`
		].join('\n')
	);
};

const stagePackageApp = () => {
	ensureReleaseAppDependencies();
	const sourceNodeModulesPath = path.join(releaseAppPath, 'node_modules');
	const targetNodeModulesPath = path.join(packageAppPath, 'node_modules');

	removeIfExists(packageAppPath);
	copyFile(path.join(releaseAppPath, 'package.json'), path.join(packageAppPath, 'package.json'));
	copyFile(path.join(releaseAppPath, 'pnpm-lock.yaml'), path.join(packageAppPath, 'pnpm-lock.yaml'));
	linkDirectory(path.join(releaseAppPath, 'dist'), path.join(packageAppPath, 'dist'));
	fs.cpSync(path.join(releaseAppPath, 'bin'), path.join(packageAppPath, 'bin'), { recursive: true });
	runPackageManager(['--dir', 'release/package-app', 'install', '--prod', '--ignore-workspace', '--ignore-scripts']);
	copyGreenworksRuntime(path.join(sourceNodeModulesPath, 'greenworks'), path.join(targetNodeModulesPath, 'greenworks'));
	sanitizePackageAppLock();
};

let publishMode: PublishMode = 'never';
let requiredPlatform: NodeJS.Platform | null = null;
const requestedTargets: string[] = [];
const cliArgs = process.argv.slice(2);

for (let index = 0; index < cliArgs.length; index += 1) {
	const arg = cliArgs[index];

	if (arg === '--help') {
		printUsage();
		process.exit(0);
	}

	if (arg === '--') {
		continue;
	}

	if (arg === '--publish') {
		const nextArg = cliArgs[index + 1] as PublishMode | undefined;
		if (!nextArg || !supportedPublishModes.has(nextArg)) {
			throw new Error(`--publish must be one of: ${Array.from(supportedPublishModes).join(', ')}`);
		}
		publishMode = nextArg;
		index += 1;
		continue;
	}

	if (arg === '--platform') {
		const nextArg = cliArgs[index + 1];
		if (!nextArg) {
			throw new Error('--platform requires a value.');
		}
		requiredPlatform = nextArg as NodeJS.Platform;
		index += 1;
		continue;
	}

	if (arg.startsWith('--')) {
		throw new Error(`Unknown option: ${arg}`);
	}

	requestedTargets.push(arg);
}

if (requiredPlatform && process.platform !== requiredPlatform) {
	console.error(
		terminalStyle.error(
			`This command requires ${requiredPlatform}. Current platform: ${process.platform}. Run it from a matching environment.`
		)
	);
	process.exit(1);
}

if (!requiredPlatform && requestedTargets.length > 0) {
	throw new Error('Targets can only be provided together with --platform.');
}

const electronBuilderArgs = ['build', '--publish', publishMode];

if (requiredPlatform === 'linux') {
	const linuxTargets = requestedTargets.length > 0 ? requestedTargets : ['deb', 'pacman'];
	for (const target of linuxTargets) {
		if (!supportedLinuxTargets.has(target)) {
			throw new Error(`Unsupported Linux target "${target}". Supported targets: ${Array.from(supportedLinuxTargets).join(', ')}`);
		}
	}
	electronBuilderArgs.push('--linux', ...linuxTargets);
} else if (requiredPlatform) {
	throw new Error(`Unsupported platform "${requiredPlatform}".`);
}

assertSteamworksNativeDepsReady();
cleanReleaseArtifacts();
runPackageManager(['run', 'build:block-lookup']);
runPackageManager(['run', 'build']);
if (publishMode === 'never' && !requiredPlatform) {
	stagePackageApp();
	electronBuilderArgs.push('-c.directories.app=release/package-app');
}
runElectronBuilder(electronBuilderArgs);

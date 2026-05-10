import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import { cleanReleaseArtifacts } from './lib/release';
import { repoRoot } from './lib/paths';

type PublishMode = 'never' | 'onTagOrDraft';

const packageManagerExecPath = process.env.npm_execpath;
const builderCliPath = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const releaseAppPath = path.join(repoRoot, 'release', 'app');
const packageAppPath = path.join(repoRoot, 'release', 'package-app');
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

const runPackageManager = (args: string[], cwd = repoRoot) => {
	if (!packageManagerExecPath) {
		throw new Error('The package-manager exec path is not set. Run this script via "pnpm run".');
	}

	execFileSync(process.execPath, [packageManagerExecPath, ...args], {
		cwd,
		stdio: 'inherit'
	});
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

const copyGreenworksRuntime = (sourcePath: string, targetPath: string) => {
	removeIfExists(targetPath);
	const packageJson = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8')) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		gypfile?: boolean;
		scripts?: Record<string, string>;
	};
	delete packageJson.dependencies;
	delete packageJson.devDependencies;
	delete packageJson.gypfile;
	delete packageJson.scripts;
	fs.mkdirSync(targetPath, { recursive: true });
	fs.writeFileSync(path.join(targetPath, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
	copyFile(path.join(sourcePath, 'greenworks.js'), path.join(targetPath, 'greenworks.js'));
	copyFile(path.join(sourcePath, 'lib', 'greenworks-win64.node'), path.join(targetPath, 'lib', 'greenworks-win64.node'));
	copyFile(path.join(sourcePath, 'lib', 'steam_api64.dll'), path.join(targetPath, 'lib', 'steam_api64.dll'));
	copyFile(path.join(sourcePath, 'lib', 'sdkencryptedappticket64.dll'), path.join(targetPath, 'lib', 'sdkencryptedappticket64.dll'));
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

const stagePackageApp = () => {
	const sourceNodeModulesPath = fs.realpathSync(path.join(releaseAppPath, 'node_modules'));
	const targetNodeModulesPath = path.join(packageAppPath, 'node_modules');

	removeIfExists(packageAppPath);
	copyFile(path.join(releaseAppPath, 'package.json'), path.join(packageAppPath, 'package.json'));
	linkDirectory(path.join(releaseAppPath, 'dist'), path.join(packageAppPath, 'dist'));
	fs.cpSync(path.join(releaseAppPath, 'bin'), path.join(packageAppPath, 'bin'), { recursive: true });
	fs.cpSync(sourceNodeModulesPath, targetNodeModulesPath, {
		filter: (sourcePath) => !new Set(['greenworks', 'nan']).has(path.relative(sourceNodeModulesPath, sourcePath).split(path.sep)[0]),
		recursive: true
	});
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
		chalk.red(`This command requires ${requiredPlatform}. Current platform: ${process.platform}. Run it from a matching environment.`)
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

cleanReleaseArtifacts();
runPackageManager(['run', 'build:native:block-lookup']);
runPackageManager(['run', 'build']);
if (publishMode === 'never' && !requiredPlatform) {
	stagePackageApp();
	electronBuilderArgs.push('-c.directories.app=release/package-app');
}
runElectronBuilder(electronBuilderArgs);

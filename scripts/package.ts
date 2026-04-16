import path from 'node:path';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import { cleanReleaseArtifacts } from './lib/release';
import { repoRoot } from './lib/paths';

type PublishMode = 'never' | 'onTagOrDraft';

const npmExecPath = process.env.npm_execpath;
const builderCliPath = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const supportedPublishModes = new Set<PublishMode>(['never', 'onTagOrDraft']);
const supportedLinuxTargets = new Set(['deb', 'pacman']);

const printUsage = () => {
	console.log(`Usage:
  npm run package
  npm run publish
  npm run package:linux
  npm run package:linux -- deb
  npm run package:linux -- pacman`);
};

const runNpm = (args: string[], cwd = repoRoot) => {
	if (!npmExecPath) {
		throw new Error('npm_execpath is not set. Run this script via "npm run".');
	}

	execFileSync(process.execPath, [npmExecPath, ...args], {
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
		chalk.red(
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

cleanReleaseArtifacts();
runNpm(['run', 'build']);
runElectronBuilder(electronBuilderArgs);

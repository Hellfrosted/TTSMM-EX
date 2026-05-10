import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseAppPath, repoRoot } from './lib/paths';

const npmExecPath = process.env.npm_execpath;
const supportedIncrementTypes = new Set(['patch', 'minor', 'major']);

const printUsage = () => {
	console.log(`Usage:
  npm run bump -- patch
  npm run bump -- minor
  npm run bump -- major`);
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

const captureNpm = (args: string[], cwd = repoRoot) => {
	if (!npmExecPath) {
		throw new Error('npm_execpath is not set. Run this script via "npm run".');
	}

	return execFileSync(process.execPath, [npmExecPath, ...args], {
		cwd,
		encoding: 'utf8'
	}).trim();
};

const git = (args: string[]) => {
	execFileSync('git', args, {
		cwd: repoRoot,
		stdio: 'inherit'
	});
};

const cliArgs = process.argv.slice(2);

if (cliArgs.includes('--help')) {
	printUsage();
	process.exit(0);
}

const [incrementType] = cliArgs;

if (!incrementType || !supportedIncrementTypes.has(incrementType)) {
	throw new Error(`Increment type must be one of: ${Array.from(supportedIncrementTypes).join(', ')}`);
}

const version = captureNpm(['version', incrementType, '--no-git-tag-version']);
runNpm(['version', incrementType, '--no-git-tag-version'], releaseAppPath);
git([
	'add',
	'--',
	'package.json',
	'package-lock.json',
	path.join('release', 'app', 'package.json'),
	path.join('release', 'app', 'package-lock.json')
]);
git(['commit', '-m', `Bump version to ${version}`]);
git(['tag', version]);

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { capturePackageManager, runPackageManager } from './lib/package-manager';
import { releaseAppPath, repoRoot } from './lib/paths';

const supportedIncrementTypes = new Set(['patch', 'minor', 'major']);

const printUsage = () => {
	console.log(`Usage:
  pnpm run version:bump -- patch
  pnpm run version:bump -- minor
  pnpm run version:bump -- major`);
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

const version = capturePackageManager(['version', incrementType, '--no-git-tag-version']);
runPackageManager(['version', incrementType, '--no-git-tag-version'], releaseAppPath);
git(['add', '--', 'package.json', path.join('release', 'app', 'package.json')]);
git(['commit', '-m', `Bump version to ${version}`]);
git(['tag', version]);

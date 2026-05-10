import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { repoRoot } from './lib/paths';

const rootPackagePath = path.join(repoRoot, 'package.json');
const { dependencies } = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8')) as {
	dependencies?: Record<string, string>;
};

if (!dependencies) {
	process.exit(0);
}

const dependenciesKeys = Object.keys(dependencies);
const nativeDeps = fs.readdirSync(path.join(repoRoot, 'node_modules')).filter((folder) => {
	return fs.existsSync(path.join(repoRoot, 'node_modules', folder, 'binding.gyp'));
});

if (nativeDeps.length === 0) {
	process.exit(0);
}

try {
	const { dependencies: dependenciesObject = {} } = JSON.parse(execSync(`npm ls ${nativeDeps.join(' ')} --json`, { cwd: repoRoot }).toString()) as {
		dependencies?: Record<string, unknown>;
	};
	const rootDependencies = Object.keys(dependenciesObject);
	const filteredRootDependencies = rootDependencies.filter((rootDependency) => dependenciesKeys.includes(rootDependency));
	if (filteredRootDependencies.length > 0) {
		const plural = filteredRootDependencies.length > 1;
		console.log(`
 ${chalk.whiteBright.bgYellow.bold('Native dependencies must stay in "./release/app".')}
${chalk.bold(filteredRootDependencies.join(', '))} ${plural ? 'are native dependencies' : 'is a native dependency'} and should be installed inside of the "./release/app" folder.
 First, uninstall the packages from "./package.json":
${chalk.whiteBright.bgGreen.bold('npm uninstall your-package')}
 ${chalk.bold('Then install the native dependency in "./release/app/package.json":')}
${chalk.whiteBright.bgGreen.bold('npm --prefix ./release/app install your-package')}
 `);
		process.exit(1);
	}
} catch {
	console.log('Native dependencies could not be checked');
}

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { repoRoot } from './lib/paths';

interface NativeDepCheckOptions {
	existsSync?: typeof fs.existsSync;
	log?: (message: string) => void;
	readFileSync?: typeof fs.readFileSync;
	rootDir?: string;
}

export function findRootNativeDependencies(
	dependencies: Record<string, string>,
	rootDir: string,
	existsSync: typeof fs.existsSync = fs.existsSync
) {
	return Object.keys(dependencies).filter((dependencyName) => {
		return existsSync(path.join(rootDir, 'node_modules', ...dependencyName.split('/'), 'binding.gyp'));
	});
}

export function checkNativeDependencies({
	existsSync = fs.existsSync,
	log = console.log,
	readFileSync = fs.readFileSync,
	rootDir = repoRoot
}: NativeDepCheckOptions = {}) {
	const rootPackagePath = path.join(rootDir, 'package.json');
	const { dependencies } = JSON.parse(readFileSync(rootPackagePath, 'utf8')) as {
		dependencies?: Record<string, string>;
	};

	if (!dependencies) {
		return 0;
	}

	const nativeDeps = findRootNativeDependencies(dependencies, rootDir, existsSync);
	if (nativeDeps.length === 0) {
		return 0;
	}

	const plural = nativeDeps.length > 1;
	log(`
${chalk.whiteBright.bgYellow.bold('Native dependencies must stay in "./release/app".')}
${chalk.bold(nativeDeps.join(', '))} ${plural ? 'are native dependencies' : 'is a native dependency'} and should be installed inside of the "./release/app" folder.
 First, uninstall the packages from "./package.json":
${chalk.whiteBright.bgGreen.bold('pnpm remove your-package')}
 ${chalk.bold('Then install the native dependency in "./release/app/package.json":')}
${chalk.whiteBright.bgGreen.bold('pnpm --dir ./release/app add your-package')}
	`);
	return 1;
}

export function runNativeDependencyCheckCli(options: NativeDepCheckOptions = {}) {
	const { log = console.log } = options;

	try {
		return checkNativeDependencies(options);
	} catch {
		log('Native dependencies could not be checked');
		return 1;
	}
}

function isExecutedDirectly() {
	if (!process.argv[1]) {
		return false;
	}

	return pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isExecutedDirectly()) {
	process.exit(runNativeDependencyCheckCli());
}

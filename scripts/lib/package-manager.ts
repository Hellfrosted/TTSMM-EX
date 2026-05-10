import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot } from './paths';

const packageManagerExecPath = process.env.npm_execpath;

const getPackageManagerCommand = (args: string[]) => {
	if (!packageManagerExecPath) {
		throw new Error('The package-manager exec path is not set. Run this script via "pnpm run".');
	}

	const extension = path.extname(packageManagerExecPath).toLowerCase();
	if (extension === '.js' || extension === '.cjs' || extension === '.mjs') {
		return {
			args: [packageManagerExecPath, ...args],
			command: process.execPath
		};
	}

	return {
		args,
		command: packageManagerExecPath
	};
};

export const runPackageManager = (args: string[], cwd = repoRoot) => {
	const command = getPackageManagerCommand(args);
	execFileSync(command.command, command.args, {
		cwd,
		stdio: 'inherit'
	});
};

export const capturePackageManager = (args: string[], cwd = repoRoot) => {
	const command = getPackageManagerCommand(args);
	return execFileSync(command.command, command.args, {
		cwd,
		encoding: 'utf8'
	}).trim();
};

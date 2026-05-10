import { spawn } from 'node:child_process';
import path from 'node:path';

const [command, ...args] = process.argv.slice(2);

if (!command) {
	console.error('Usage: node --import=tsx ./scripts/run-with-clean-electron-env.ts <command> [...args]');
	process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const pathKeys = Object.keys(env).flatMap((key) => (key.toLowerCase() === 'path' ? [key] : []));
const primaryPathKey = pathKeys[0] ?? 'PATH';
const mergedPath = [
	...new Set([
		path.resolve('node_modules/.bin'),
		path.dirname(process.execPath),
		...pathKeys.flatMap((key) => (env[key] ? [env[key]] : []))
	])
].join(path.delimiter);

for (const pathKey of pathKeys) {
	if (pathKey !== primaryPathKey) {
		delete env[pathKey];
	}
}

env[primaryPathKey] = mergedPath;

const quoteForShell = (value: string) => {
	if (process.platform === 'win32') {
		return `"${value.replace(/"/g, '\\"')}"`;
	}

	return `'${value.replace(/'/g, `'\\''`)}'`;
};

const formatCommandForShell = (value: string) => {
	return /[\s"]/u.test(value) ? quoteForShell(value) : value;
};

const shellCommand = [formatCommandForShell(command), ...args.map(quoteForShell)].join(' ');

const child = spawn(shellCommand, {
	env,
	shell: true,
	stdio: 'inherit'
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 0);
});

child.on('error', (error) => {
	console.error(error);
	process.exit(1);
});

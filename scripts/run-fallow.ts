import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { isExecutedDirectly } from './lib/is-main';
import { repoRoot } from './lib/paths';

const fallowExecutablePath = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'fallow.cmd' : 'fallow');
const skippedPackageJsonEntryPointWarningFragment =
	'WARN Skipped 5 package.json entry points outside project root or containing parent directory traversal';
const skippedPackageJsonEntryPointWarningEntries = [
	'../../scripts/electron-rebuild.ts',
	'../../scripts/link-modules.ts',
	'./dist/main/main.js'
] as const;

export function shouldSuppressFallowStderrLine(line: string) {
	return (
		line.includes(skippedPackageJsonEntryPointWarningFragment) &&
		skippedPackageJsonEntryPointWarningEntries.every((entry) => line.includes(entry))
	);
}

export function runFallowCli(args: readonly string[]) {
	return new Promise<number>((resolve, reject) => {
		const child = spawn(fallowExecutablePath, args, {
			cwd: repoRoot,
			env: process.env,
			stdio: ['inherit', 'pipe', 'pipe']
		});

		child.stdout.pipe(process.stdout);

		const stderrReader = readline.createInterface({
			input: child.stderr
		});
		stderrReader.on('line', (line) => {
			if (!shouldSuppressFallowStderrLine(line)) {
				process.stderr.write(`${line}\n`);
			}
		});

		child.once('error', (error) => {
			reject(error);
		});
		child.once('close', (code, signal) => {
			stderrReader.close();
			if (signal) {
				reject(new Error(`fallow exited from signal ${signal}`));
				return;
			}
			resolve(code ?? 1);
		});
	});
}

if (isExecutedDirectly(import.meta.url)) {
	void runFallowCli(process.argv.slice(2)).then((exitCode) => {
		process.exit(exitCode);
	});
}

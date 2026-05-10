import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repoRoot, releaseAppDistPath, releaseBuildPath } from './lib/paths';

const STEAMWORKS_BYPASS_ENV = 'TTSMM_BYPASS_STEAMWORKS';
const USER_DATA_DIR_OVERRIDE_ENV = 'TTSMM_EX_USER_DATA_DIR';
const UI_SMOKE_ENV = 'TTSMM_EX_UI_SMOKE';
const UI_SMOKE_OUTPUT_ENV = 'TTSMM_EX_UI_SMOKE_OUTPUT';
const UI_SMOKE_SCREENSHOT_DIR_ENV = 'TTSMM_EX_UI_SMOKE_SCREENSHOT_DIR';

const electronBinary = path.join(repoRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const mainEntryPath = path.join(releaseAppDistPath, 'main', 'main.js');
const smokeRoot = path.join(repoRoot, 'release', 'smoke', 'ui');
const tempRoot = path.join(os.tmpdir(), 'ttsmm-ui-smoke');
const outputPath = path.join(tempRoot, 'ui-smoke-output.json');
const userDataPath = path.join(tempRoot, 'user-data');
const requestedPackagedApp = process.argv.includes('--packaged');

function resolvePackagedExecutable() {
	if (process.platform === 'win32') {
		return path.join(releaseBuildPath, 'win-unpacked', 'resources', 'app.asar');
	}

	if (process.platform === 'linux') {
		return path.join(releaseBuildPath, 'linux-unpacked', 'resources', 'app.asar');
	}

	if (process.platform === 'darwin') {
		return path.join(releaseBuildPath, 'mac', 'TTSMM-EX.app', 'Contents', 'Resources', 'app.asar');
	}

	throw new Error(`Packaged UI smoke is not supported on ${process.platform}.`);
}

function resolveLaunchCommand() {
	const sandboxArgs = process.platform === 'linux' ? ['--no-sandbox'] : [];

	if (requestedPackagedApp) {
		const executablePath = resolvePackagedExecutable();
		if (!fs.existsSync(executablePath)) {
			throw new Error(
				`Packaged app executable is missing at ${executablePath}. Run pnpm run package before pnpm run smoke:ui -- --packaged.`
			);
		}
		return {
			command: electronBinary,
			args: [...sandboxArgs, executablePath]
		};
	}

	if (!fs.existsSync(mainEntryPath)) {
		throw new Error(`Built Electron main entry is missing at ${mainEntryPath}. Run pnpm run build before pnpm run smoke:ui.`);
	}

	return {
		command: electronBinary,
		args: [...sandboxArgs, repoRoot]
	};
}

function seedSmokeUserData() {
	fs.mkdirSync(userDataPath, { recursive: true });
	fs.writeFileSync(
		path.join(userDataPath, 'config.json'),
		JSON.stringify(
			{
				gameExec: process.execPath,
				workshopID: '2790161231',
				logsDir: '',
				closeOnLaunch: false,
				language: 'english',
				activeCollection: 'default',
				steamMaxConcurrency: 5,
				currentPath: '/collections/main',
				viewConfigs: {},
				ignoredValidationErrors: {},
				userOverrides: {}
			},
			null,
			4
		),
		'utf8'
	);
	fs.mkdirSync(path.join(userDataPath, 'collections'), { recursive: true });
	fs.writeFileSync(path.join(userDataPath, 'collections', 'default.json'), JSON.stringify({ name: 'default', mods: [] }, null, 4), 'utf8');
}

fs.rmSync(smokeRoot, { recursive: true, force: true });
fs.rmSync(userDataPath, { recursive: true, force: true });
fs.rmSync(outputPath, { force: true });
seedSmokeUserData();

const env = { ...process.env };
for (const key of Object.keys(env)) {
	if (key.toLowerCase() === 'electron_run_as_node') {
		delete env[key];
	}
}
env.NODE_ENV = 'production';
env[STEAMWORKS_BYPASS_ENV] = '1';
env.TTSMM_EX_DISABLE_AUTO_UPDATES = '1';
env[UI_SMOKE_ENV] = '1';
env[USER_DATA_DIR_OVERRIDE_ENV] = userDataPath;
env[UI_SMOKE_OUTPUT_ENV] = outputPath;
env[UI_SMOKE_SCREENSHOT_DIR_ENV] = smokeRoot;
env.ELECTRON_ENABLE_LOGGING = '1';

const launch = resolveLaunchCommand();
let succeeded = false;
try {
	const result = spawnSync(launch.command, launch.args, {
		cwd: repoRoot,
		env,
		stdio: 'pipe',
		encoding: 'utf8',
		timeout: 90000
	});

	if (result.error) {
		if (!fs.existsSync(outputPath)) {
			console.error(result.stdout);
			console.error(result.stderr);
		}
		throw result.error;
	}

	if (!fs.existsSync(outputPath)) {
		throw new Error(
			[
				'UI smoke test did not produce output.',
				`stdout: ${result.stdout || '<empty>'}`,
				`stderr: ${result.stderr || '<empty>'}`,
				`outputPath: ${outputPath}`,
				`userDataPath: ${userDataPath}`
			].join('\n')
		);
	}

	const output = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
		error?: string;
		results?: Array<{ name: string; screenshotPath: string; metrics: Record<string, unknown> }>;
		consoleMessages?: Array<{ level: string; message: string; lineNumber: number; sourceId: string }>;
		lifecycle?: unknown[];
		packaged?: boolean;
	};

	console.log(JSON.stringify(output, null, 2));

	if (result.status !== 0 || output.error) {
		throw new Error(output.error || `UI smoke test failed with exit code ${result.status}`);
	}

	if (!output.results || output.results.length < 4) {
		throw new Error('UI smoke test did not complete all renderer checkpoints.');
	}

	if (output.lifecycle && output.lifecycle.length > 0) {
		throw new Error(`UI smoke test captured renderer lifecycle failures: ${JSON.stringify(output.lifecycle, null, 2)}`);
	}

	console.log(`UI smoke screenshots written to ${pathToFileURL(smokeRoot).toString()}`);
	succeeded = true;
} finally {
	if (succeeded) {
		fs.rmSync(userDataPath, { recursive: true, force: true });
		fs.rmSync(outputPath, { force: true });
	}
}

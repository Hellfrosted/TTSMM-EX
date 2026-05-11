import { type ChildProcess, spawn } from 'node:child_process';
import electronPath from 'electron';
import { build, createServer, type Rollup } from 'vite';
import { createMainConfig, createPreloadConfig, createRendererConfig } from '../vite.config';

type Watcher = Rollup.RollupWatcher;

const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' };
delete env.ELECTRON_RUN_AS_NODE;

let electronProcess: ChildProcess | null = null;
let mainReady = false;
let preloadReady = false;
let restartPending = false;
let restartTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;
let cleanupDevServer: (() => Promise<void>) | null = null;

function stopElectron() {
	if (!electronProcess || electronProcess.killed) {
		return;
	}

	electronProcess.kill();
	electronProcess = null;
}

function clearRestartTimer() {
	if (!restartTimer) {
		return;
	}

	clearTimeout(restartTimer);
	restartTimer = null;
	restartPending = false;
}

function startElectron() {
	if (!mainReady || !preloadReady || shuttingDown) {
		return;
	}

	stopElectron();
	electronProcess = spawn(electronPath as unknown as string, ['.'], {
		env,
		stdio: 'inherit'
	});

	electronProcess.on('exit', () => {
		electronProcess = null;
	});
}

function requestRestart() {
	if (!mainReady || !preloadReady) {
		return;
	}

	if (restartPending) {
		return;
	}

	restartPending = true;
	restartTimer = setTimeout(() => {
		restartTimer = null;
		restartPending = false;
		startElectron();
	}, 100);
}

function attachWatcher(name: 'main' | 'preload', watcher: Watcher) {
	watcher.on('event', (event) => {
		if (event.code === 'ERROR') {
			console.error(`[${name}] build failed`);
			console.error(event.error);
			return;
		}

		if (event.code !== 'END') {
			return;
		}

		if (name === 'main') {
			mainReady = true;
		} else {
			preloadReady = true;
		}

		requestRestart();
	});
}

function closeWatcher(watcher: Watcher) {
	return new Promise<void>((resolve) => {
		watcher.close();
		resolve();
	});
}

async function shutdown() {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	clearRestartTimer();
	stopElectron();
	await cleanupDevServer?.();
}

function shutdownAndExit(exitCode: number) {
	void shutdown().finally(() => {
		process.exit(exitCode);
	});
}

process.once('SIGINT', () => {
	shutdownAndExit(0);
});
process.once('SIGTERM', () => {
	shutdownAndExit(0);
});
process.once('SIGHUP', () => {
	shutdownAndExit(0);
});
process.once('exit', () => {
	stopElectron();
});
process.once('uncaughtException', (error) => {
	console.error(error);
	shutdownAndExit(1);
});
process.once('unhandledRejection', (reason) => {
	console.error(reason);
	shutdownAndExit(1);
});

async function main() {
	const rendererServer = await createServer(createRendererConfig(true));
	await rendererServer.listen();
	rendererServer.printUrls();

	const rendererUrl = rendererServer.resolvedUrls?.local[0];
	if (!rendererUrl) {
		throw new Error('Vite renderer dev server did not provide a local URL.');
	}
	env.ELECTRON_RENDERER_URL = rendererUrl;

	const mainConfig = createMainConfig();
	const preloadConfig = createPreloadConfig();
	const mainWatcher = (await build({
		...mainConfig,
		mode: 'development',
		build: {
			...mainConfig.build,
			watch: {}
		}
	})) as Watcher;
	const preloadWatcher = (await build({
		...preloadConfig,
		mode: 'development',
		build: {
			...preloadConfig.build,
			watch: {}
		}
	})) as Watcher;

	attachWatcher('main', mainWatcher);
	attachWatcher('preload', preloadWatcher);

	cleanupDevServer = async () => {
		await Promise.all([closeWatcher(mainWatcher), closeWatcher(preloadWatcher), rendererServer.close()]);
	};
}

void main().catch((error) => {
	console.error(error);
	shutdownAndExit(1);
});

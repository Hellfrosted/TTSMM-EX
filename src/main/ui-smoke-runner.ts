import fs from 'fs';
import path from 'path';
import { app, type BrowserWindow } from 'electron';

interface UiSmokeCheckpoint {
	name: string;
	label?: string;
	selector: string;
}

interface UiSmokeConsoleMessage {
	level: unknown;
	message: unknown;
	lineNumber?: unknown;
	sourceId?: unknown;
}

const UI_SMOKE_OUTPUT_ENV = 'TTSMM_EX_UI_SMOKE_OUTPUT';
const UI_SMOKE_SCREENSHOT_DIR_ENV = 'TTSMM_EX_UI_SMOKE_SCREENSHOT_DIR';
const UI_SMOKE_ARG = '--ttsmm-ex-ui-smoke';
const UI_SMOKE_OUTPUT_ARG = '--ttsmm-ex-ui-smoke-output=';
const UI_SMOKE_SCREENSHOT_DIR_ARG = '--ttsmm-ex-ui-smoke-screenshot-dir=';
const UI_SMOKE_PLAIN_ARG = 'ttsmm-ex-ui-smoke';
const UI_SMOKE_OUTPUT_PLAIN_ARG = 'ttsmm-ex-ui-smoke-output=';
const UI_SMOKE_SCREENSHOT_DIR_PLAIN_ARG = 'ttsmm-ex-ui-smoke-screenshot-dir=';

const CHECKPOINTS: UiSmokeCheckpoint[] = [
	{ name: 'startup', selector: '.AppRoot' },
	{ name: 'collections', label: 'Mod Collections', selector: '[data-view-stage="collections"][data-active="true"]' },
	{ name: 'block-lookup', label: 'Block Lookup', selector: '[data-view-stage="block-lookup"][data-active="true"], .BlockLookupViewLayout' },
	{ name: 'settings', label: 'Settings', selector: '[data-view-stage="settings"][data-active="true"], .SettingsView' }
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSelector(window: BrowserWindow, selector: string, timeoutMs = 30000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const found = (await window.webContents.executeJavaScript(
			`Boolean(document.querySelector(${JSON.stringify(selector)}))`,
			true
		)) as boolean;
		if (found) {
			return;
		}
		await delay(150);
	}

	const diagnostics = await window.webContents
		.executeJavaScript(
			`
			(() => ({
				url: location.href,
				readyState: document.readyState,
				title: document.title,
				bodyText: document.body.innerText.slice(0, 500),
				bodyHtml: document.body.innerHTML.slice(0, 1000),
				scripts: Array.from(document.scripts).map((script) => script.src || '[inline]').slice(0, 10)
			}))()
			`,
			true
		)
		.catch((error) => ({ executeJavaScriptError: String(error) }));
	throw new Error(`Timed out waiting for selector: ${selector}. Diagnostics: ${JSON.stringify(diagnostics)}`);
}

async function clickMenuItem(window: BrowserWindow, label: string) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 30000) {
		const clicked = (await window.webContents.executeJavaScript(
			`
			(() => {
				const buttons = Array.from(document.querySelectorAll('button'));
				const button = buttons.find((candidate) => candidate.textContent && candidate.textContent.trim().includes(${JSON.stringify(label)}));
				if (button && button.getAttribute('aria-current') === 'page') {
					return true;
				}
				if (!button || button.disabled) {
					return false;
				}
				button.click();
				return true;
			})()
			`,
			true
		)) as boolean;
		if (clicked) {
			return;
		}
		await delay(200);
	}
	throw new Error(`Could not click enabled menu item: ${label}`);
}

async function captureCheckpoint(window: BrowserWindow, checkpoint: UiSmokeCheckpoint, screenshotDir: string) {
	if (checkpoint.label) {
		await clickMenuItem(window, checkpoint.label);
		await delay(250);
	}

	await waitForSelector(window, checkpoint.selector);
	const metrics = (await window.webContents.executeJavaScript(
		`
		(() => {
			const root = document.querySelector('.AppRoot');
			const activeStage = document.querySelector('[data-view-stage][data-active="true"]');
			const checkpointElement = document.querySelector(${JSON.stringify(checkpoint.selector)});
			const rect = (activeStage || root || document.body).getBoundingClientRect();
			return {
				title: document.title,
				bodyTextLength: document.body.innerText.trim().length,
				rootExists: Boolean(root),
				checkpointExists: Boolean(checkpointElement),
				activeStage: activeStage ? activeStage.getAttribute('data-view-stage') : null,
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				background: root ? getComputedStyle(root).backgroundColor : ''
			};
		})()
		`,
		true
	)) as {
		bodyTextLength: number;
		rootExists: boolean;
		checkpointExists: boolean;
		width: number;
		height: number;
	};

	if (!metrics.rootExists || !metrics.checkpointExists || metrics.bodyTextLength <= 0 || metrics.width <= 0 || metrics.height <= 0) {
		throw new Error(`Renderer checkpoint ${checkpoint.name} looked blank: ${JSON.stringify(metrics)}`);
	}

	const screenshotPath = path.join(screenshotDir, `${checkpoint.name}.png`);
	if (!window.isVisible()) {
		window.show();
	}
	window.focus();
	await delay(150);
	const image = await window.webContents.capturePage();
	fs.writeFileSync(screenshotPath, image.toPNG());
	return { ...checkpoint, screenshotPath, metrics };
}

function writeOutput(outputPath: string, output: unknown) {
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
}

function readArgValue(prefix: string, argv: string[] = process.argv) {
	const arg = argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : undefined;
}

export function isUiSmokeRun(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv) {
	return env.TTSMM_EX_UI_SMOKE === '1' || argv.includes(UI_SMOKE_ARG) || argv.includes(UI_SMOKE_PLAIN_ARG);
}

export async function runUiSmoke(window: BrowserWindow, env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv) {
	const outputPath = env[UI_SMOKE_OUTPUT_ENV] || readArgValue(UI_SMOKE_OUTPUT_ARG, argv) || readArgValue(UI_SMOKE_OUTPUT_PLAIN_ARG, argv);
	const screenshotDir =
		env[UI_SMOKE_SCREENSHOT_DIR_ENV] ||
		readArgValue(UI_SMOKE_SCREENSHOT_DIR_ARG, argv) ||
		readArgValue(UI_SMOKE_SCREENSHOT_DIR_PLAIN_ARG, argv);
	if (!outputPath || !screenshotDir) {
		throw new Error(`${UI_SMOKE_OUTPUT_ENV} and ${UI_SMOKE_SCREENSHOT_DIR_ENV} are required for UI smoke runs.`);
	}

	const consoleMessages: UiSmokeConsoleMessage[] = [];
	const lifecycle: unknown[] = [];
	window.webContents.on('console-message', (event) => {
		consoleMessages.push({
			level: event.level,
			message: event.message,
			lineNumber: event.lineNumber,
			sourceId: event.sourceId
		});
	});
	window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
		lifecycle.push({ event: 'did-fail-load', errorCode, errorDescription, validatedURL, isMainFrame });
	});
	window.webContents.on('preload-error', (_event, preloadPath, error) => {
		lifecycle.push({ event: 'preload-error', preloadPath, error: error instanceof Error ? error.stack || error.message : String(error) });
	});
	window.webContents.on('render-process-gone', (_event, details) => {
		lifecycle.push({ event: 'render-process-gone', details });
	});

	try {
		fs.rmSync(screenshotDir, { recursive: true, force: true });
		fs.mkdirSync(screenshotDir, { recursive: true });
		await waitForSelector(window, '.AppRoot');
		const results = [];
		for (const checkpoint of CHECKPOINTS) {
			results.push(await captureCheckpoint(window, checkpoint, screenshotDir));
		}
		writeOutput(outputPath, { results, consoleMessages, lifecycle, packaged: app.isPackaged });
		app.quit();
	} catch (error) {
		writeOutput(outputPath, {
			error: error instanceof Error ? error.stack || error.message : String(error),
			consoleMessages,
			lifecycle,
			packaged: app.isPackaged
		});
		app.exit(1);
	}
}

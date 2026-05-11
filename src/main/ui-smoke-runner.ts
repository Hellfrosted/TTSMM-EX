import { app, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import {
	isUiSmokeRunRequest,
	readPrefixedArgValue,
	UI_SMOKE_OUTPUT_ARG,
	UI_SMOKE_OUTPUT_ENV,
	UI_SMOKE_OUTPUT_PLAIN_ARG,
	UI_SMOKE_SCREENSHOT_DIR_ARG,
	UI_SMOKE_SCREENSHOT_DIR_ENV,
	UI_SMOKE_SCREENSHOT_DIR_PLAIN_ARG
} from 'shared/ui-smoke';
import zlib from 'zlib';

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

interface UiSmokeCheckpointMetrics {
	title: string;
	bodyTextLength: number;
	rootExists: boolean;
	checkpointExists: boolean;
	activeStage: string | null;
	width: number;
	height: number;
	viewportWidth: number;
	viewportHeight: number;
	windowWidth: number;
	windowHeight: number;
	visible: boolean;
	background: string;
}

const CHECKPOINTS: UiSmokeCheckpoint[] = [
	{ name: 'startup', selector: '.AppRoot' },
	{ name: 'collections', label: 'Mod Collections', selector: '[data-view-stage="collections"][data-active="true"]' },
	{ name: 'block-lookup', label: 'Block Lookup', selector: '[data-view-stage="block-lookup"][data-active="true"], .BlockLookupViewLayout' },
	{ name: 'settings', label: 'Settings', selector: '[data-view-stage="settings"][data-active="true"], .SettingsView' }
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function showSmokeWindow(window: BrowserWindow) {
	if (window.isMinimized()) {
		window.restore();
	}
	if (!window.isVisible()) {
		window.show();
	}
	window.focus();
}

async function collectCheckpointMetrics(window: BrowserWindow, selector: string) {
	const bounds = window.getBounds();
	const metrics = (await window.webContents.executeJavaScript(
		`
		(() => {
			const root = document.querySelector('.AppRoot');
			const activeStage = document.querySelector('[data-view-stage][data-active="true"]');
			const checkpointElement = document.querySelector(${JSON.stringify(selector)});
			const measuredElement = activeStage || root || document.body;
			const rect = measuredElement.getBoundingClientRect();
			return {
				title: document.title,
				bodyTextLength: document.body.innerText.trim().length,
				rootExists: Boolean(root),
				checkpointExists: Boolean(checkpointElement),
				activeStage: activeStage ? activeStage.getAttribute('data-view-stage') : null,
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight,
				background: root ? getComputedStyle(root).backgroundColor : ''
			};
		})()
		`,
		true
	)) as Omit<UiSmokeCheckpointMetrics, 'windowWidth' | 'windowHeight' | 'visible'>;

	return {
		...metrics,
		windowWidth: bounds.width,
		windowHeight: bounds.height,
		visible: window.isVisible()
	};
}

function isRenderableCheckpoint(metrics: UiSmokeCheckpointMetrics) {
	return (
		metrics.rootExists &&
		metrics.checkpointExists &&
		metrics.bodyTextLength > 0 &&
		metrics.width > 0 &&
		metrics.height > 0 &&
		metrics.viewportWidth > 0 &&
		metrics.viewportHeight > 0 &&
		metrics.windowWidth > 0 &&
		metrics.windowHeight > 0
	);
}

function parsePngChunks(png: Buffer) {
	const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (!png.subarray(0, pngSignature.length).equals(pngSignature)) {
		return undefined;
	}

	const chunks: { type: string; data: Buffer }[] = [];
	let offset = pngSignature.length;
	while (offset + 12 <= png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.toString('ascii', offset + 4, offset + 8);
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		if (dataEnd + 4 > png.length) {
			return undefined;
		}
		chunks.push({ type, data: png.subarray(dataStart, dataEnd) });
		offset = dataEnd + 4;
		if (type === 'IEND') {
			break;
		}
	}

	return chunks;
}

function getPngPixelLayout(channels: number, width: number, inflated: Buffer) {
	const stride = width * channels;
	const rowLength = stride + 1;
	if (stride <= 0 || inflated.length % rowLength !== 0) {
		return undefined;
	}
	return { rowLength, stride };
}

function unfilterPngScanlines(inflated: Buffer, width: number, height: number, channels: number) {
	const layout = getPngPixelLayout(channels, width, inflated);
	if (!layout || inflated.length < layout.rowLength * height) {
		return undefined;
	}

	const output = Buffer.alloc(layout.stride * height);
	for (let y = 0; y < height; y += 1) {
		const inputRowStart = y * layout.rowLength;
		const outputRowStart = y * layout.stride;
		const previousRowStart = outputRowStart - layout.stride;
		const filter = inflated[inputRowStart];
		for (let x = 0; x < layout.stride; x += 1) {
			const rawValue = inflated[inputRowStart + 1 + x];
			const left = x >= channels ? output[outputRowStart + x - channels] : 0;
			const up = y > 0 ? output[previousRowStart + x] : 0;
			const upLeft = y > 0 && x >= channels ? output[previousRowStart + x - channels] : 0;
			let nextValue: number;
			if (filter === 0) {
				nextValue = rawValue;
			} else if (filter === 1) {
				nextValue = rawValue + left;
			} else if (filter === 2) {
				nextValue = rawValue + up;
			} else if (filter === 3) {
				nextValue = rawValue + Math.floor((left + up) / 2);
			} else if (filter === 4) {
				const p = left + up - upLeft;
				const pa = Math.abs(p - left);
				const pb = Math.abs(p - up);
				const pc = Math.abs(p - upLeft);
				nextValue = rawValue + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
			} else {
				return undefined;
			}
			output[outputRowStart + x] = nextValue & 0xff;
		}
	}

	return output;
}

function hasVisiblePngContent(png: Buffer) {
	const chunks = parsePngChunks(png);
	if (!chunks) {
		return false;
	}

	const header = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
	if (!header || header.length < 13) {
		return false;
	}

	const width = header.readUInt32BE(0);
	const height = header.readUInt32BE(4);
	const bitDepth = header[8];
	const colorType = header[9];
	const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : undefined;
	if (width <= 0 || height <= 0 || bitDepth !== 8 || !channels) {
		return false;
	}

	const compressed = Buffer.concat(chunks.flatMap((chunk) => (chunk.type === 'IDAT' ? [chunk.data] : [])));
	if (compressed.length === 0) {
		return false;
	}

	const pixels = unfilterPngScanlines(zlib.inflateSync(compressed), width, height, channels);
	if (!pixels) {
		return false;
	}

	let firstVisiblePixel: number[] | undefined;
	for (let index = 0; index < pixels.length; index += channels) {
		const alpha = channels === 4 ? (pixels[index + 3] ?? 0) : 255;
		if (alpha === 0) {
			continue;
		}
		const pixel = [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
		if (!firstVisiblePixel) {
			firstVisiblePixel = pixel;
			continue;
		}
		const colorDistance =
			Math.abs(pixel[0] - firstVisiblePixel[0]) + Math.abs(pixel[1] - firstVisiblePixel[1]) + Math.abs(pixel[2] - firstVisiblePixel[2]);
		if (colorDistance > 12) {
			return true;
		}
	}

	return false;
}

async function waitForRenderableCheckpoint(window: BrowserWindow, checkpoint: UiSmokeCheckpoint, timeoutMs = 30000) {
	const startedAt = Date.now();
	let lastMetrics: UiSmokeCheckpointMetrics | undefined;

	while (Date.now() - startedAt < timeoutMs) {
		showSmokeWindow(window);
		// eslint-disable-next-line react-doctor/async-await-in-loop -- smoke checks poll until the renderer becomes stable.
		lastMetrics = await collectCheckpointMetrics(window, checkpoint.selector);
		if (isRenderableCheckpoint(lastMetrics)) {
			return lastMetrics;
		}
		// eslint-disable-next-line react-doctor/async-await-in-loop -- the delay is the polling interval.
		await delay(150);
	}

	const metrics = lastMetrics || (await collectCheckpointMetrics(window, checkpoint.selector));
	throw new Error(`Renderer checkpoint ${checkpoint.name} looked blank: ${JSON.stringify(metrics)}`);
}

async function waitForSelector(window: BrowserWindow, selector: string, timeoutMs = 30000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		// eslint-disable-next-line react-doctor/async-await-in-loop -- selector polling must run sequentially.
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
		// eslint-disable-next-line react-doctor/async-await-in-loop -- menu polling depends on the previous attempt.
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
	showSmokeWindow(window);

	if (checkpoint.label) {
		await clickMenuItem(window, checkpoint.label);
		await delay(250);
	}

	await waitForSelector(window, checkpoint.selector);
	const metrics = await waitForRenderableCheckpoint(window, checkpoint);

	const screenshotPath = path.join(screenshotDir, `${checkpoint.name}.png`);
	showSmokeWindow(window);
	await delay(150);
	const image = await window.webContents.capturePage();
	const png = image.toPNG();
	fs.writeFileSync(screenshotPath, png);
	if (!hasVisiblePngContent(png)) {
		throw new Error(`Renderer checkpoint ${checkpoint.name} screenshot looked blank: ${screenshotPath}`);
	}
	return { ...checkpoint, screenshotPath, metrics };
}

function writeOutput(outputPath: string, output: unknown) {
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
}

export function isUiSmokeRun(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv) {
	return isUiSmokeRunRequest(env, argv);
}

export async function runUiSmoke(window: BrowserWindow, env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv) {
	const outputPath =
		env[UI_SMOKE_OUTPUT_ENV] || readPrefixedArgValue(UI_SMOKE_OUTPUT_ARG, argv) || readPrefixedArgValue(UI_SMOKE_OUTPUT_PLAIN_ARG, argv);
	const screenshotDir =
		env[UI_SMOKE_SCREENSHOT_DIR_ENV] ||
		readPrefixedArgValue(UI_SMOKE_SCREENSHOT_DIR_ARG, argv) ||
		readPrefixedArgValue(UI_SMOKE_SCREENSHOT_DIR_PLAIN_ARG, argv);
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
		showSmokeWindow(window);
		await waitForSelector(window, '.AppRoot');
		const results = [];
		for (const checkpoint of CHECKPOINTS) {
			// eslint-disable-next-line react-doctor/async-await-in-loop -- screenshots are captured in deterministic checkpoint order.
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

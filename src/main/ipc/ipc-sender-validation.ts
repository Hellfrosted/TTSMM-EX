import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ValidChannel } from 'shared/ipc';
import { resolveHtmlPath } from '../util';

interface IpcSenderFrame {
	url: string;
}

interface IpcSenderValidationEvent {
	senderFrame?: IpcSenderFrame | null;
}

interface IpcSenderValidationOptions {
	rendererUrl?: string;
}

function parseUrl(value: string | undefined): URL | null {
	if (!value) {
		return null;
	}

	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function normalizeFilePathFromUrl(url: URL) {
	const filePath = path.normalize(fileURLToPath(url));
	return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

function hasExpectedHttpRendererPath(senderUrl: URL, expectedRendererUrl: URL) {
	const expectedPaths = new Set([expectedRendererUrl.pathname]);
	if (expectedRendererUrl.pathname.endsWith('/index.html')) {
		expectedPaths.add(expectedRendererUrl.pathname.slice(0, -'index.html'.length));
	}

	return expectedPaths.has(senderUrl.pathname);
}

export function isValidIpcSender(
	event: IpcSenderValidationEvent,
	{ rendererUrl = resolveHtmlPath('index.html') }: IpcSenderValidationOptions = {}
) {
	const senderUrl = parseUrl(event.senderFrame?.url);
	const expectedRendererUrl = parseUrl(rendererUrl);
	if (!senderUrl || !expectedRendererUrl) {
		return false;
	}

	if (expectedRendererUrl.protocol === 'file:') {
		return senderUrl.protocol === 'file:' && normalizeFilePathFromUrl(senderUrl) === normalizeFilePathFromUrl(expectedRendererUrl);
	}

	if (expectedRendererUrl.protocol === 'http:' || expectedRendererUrl.protocol === 'https:') {
		return (
			senderUrl.protocol === expectedRendererUrl.protocol &&
			senderUrl.origin === expectedRendererUrl.origin &&
			hasExpectedHttpRendererPath(senderUrl, expectedRendererUrl)
		);
	}

	return false;
}

export function assertValidIpcSender(channel: ValidChannel, event: IpcSenderValidationEvent, options: IpcSenderValidationOptions = {}) {
	if (!isValidIpcSender(event, options)) {
		throw new Error(`Rejected IPC sender for ${channel}`);
	}
}

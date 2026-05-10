import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Protocol, ProtocolRequest, ProtocolResponse } from 'electron';
import log from 'electron-log';

const PREVIEW_HOST = 'preview';
const NOT_FOUND_ERROR = -6;

const activePreviewTokens = new Map<string, string>();
const previousPreviewTokens = new Map<string, string>();

function isAllowedPreviewFileName(fileName: string): boolean {
	const normalizedName = fileName.toLowerCase();
	return normalizedName === 'preview.png' || normalizedName.endsWith(' preview.png');
}

function normalizePreviewPath(previewPath: string): string {
	return path.normalize(path.resolve(previewPath));
}

function resolveRegisteredPreviewPath(previewPath: string): string | null {
	const normalizedPath = normalizePreviewPath(previewPath);
	if (!isAllowedPreviewFileName(path.basename(normalizedPath))) {
		return null;
	}
	if (!fs.existsSync(normalizedPath)) {
		return null;
	}

	try {
		const realPath = normalizePreviewPath(fs.realpathSync(normalizedPath));
		const owningDirectory = path.dirname(normalizedPath);
		const relativeRealPath = path.relative(owningDirectory, realPath);
		if (relativeRealPath.startsWith('..') || path.isAbsolute(relativeRealPath)) {
			log.warn(`Rejected preview path outside mod directory: ${previewPath}`);
			return null;
		}
		if (!isAllowedPreviewFileName(path.basename(realPath))) {
			return null;
		}
		return realPath;
	} catch (error) {
		log.warn(`Failed to resolve preview path ${previewPath}`);
		log.warn(error);
		return null;
	}
}

export function clearPreviewAllowlist() {
	previousPreviewTokens.clear();
	activePreviewTokens.forEach((resolvedPath, token) => {
		previousPreviewTokens.set(token, resolvedPath);
	});
	activePreviewTokens.clear();
}

export function registerPreviewImage(previewPath: string): string | undefined {
	const resolvedPath = resolveRegisteredPreviewPath(previewPath);
	if (!resolvedPath) {
		return undefined;
	}

	const token = crypto.createHash('sha256').update(resolvedPath).digest('hex');
	activePreviewTokens.set(token, resolvedPath);
	return `image://${PREVIEW_HOST}/${token}`;
}

export function resolvePreviewImageRequest(requestUrl: string): string | null {
	try {
		const parsed = new URL(requestUrl);
		if (parsed.hostname !== PREVIEW_HOST) {
			return null;
		}
		const token = parsed.pathname.replace(/^\/+/, '');
		if (!token) {
			return null;
		}
		const resolvedPath = activePreviewTokens.get(token) || previousPreviewTokens.get(token);
		if (!resolvedPath) {
			return null;
		}
		const expectedFilename = path.basename(resolvedPath).toLowerCase();
		if (!isAllowedPreviewFileName(expectedFilename)) {
			return null;
		}
		if (!fs.existsSync(resolvedPath)) {
			return null;
		}
		return resolvedPath;
	} catch (error) {
		log.error(`Failed to resolve preview image request for ${requestUrl}`);
		log.error(error);
		return null;
	}
}

function createPreviewProtocolHandler() {
	return (request: ProtocolRequest, callback: (response: string | ProtocolResponse) => void) => {
		const resolvedPath = resolvePreviewImageRequest(request.url);
		if (!resolvedPath) {
			callback({ error: NOT_FOUND_ERROR });
			return;
		}
		callback(resolvedPath);
	};
}

export function registerPreviewProtocol(protocol: Protocol) {
	protocol.registerFileProtocol('image', createPreviewProtocolHandler());
}

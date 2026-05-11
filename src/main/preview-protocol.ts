import crypto from 'crypto';
import { Protocol, ProtocolRequest, ProtocolResponse } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';

const PREVIEW_HOST = 'preview';
const BLOCK_LOOKUP_PREVIEW_HOST = 'block-preview';
const BLOCK_LOOKUP_PREVIEW_CACHE_DIR = 'block-lookup-rendered-previews';
const NOT_FOUND_ERROR = -6;

const activePreviewTokens = new Map<string, string>();
const previousPreviewTokens = new Map<string, string>();

function isAllowedPreviewFileName(fileName: string): boolean {
	const normalizedName = fileName.toLowerCase();
	return normalizedName === 'preview.png' || normalizedName.endsWith(' preview.png');
}

function isAllowedBlockLookupPreviewFileName(fileName: string): boolean {
	return ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(fileName).toLowerCase());
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

export function createBlockLookupPreviewImageUrl(cacheRelativePath: string): string | undefined {
	const normalizedPath = cacheRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');
	if (!normalizedPath || normalizedPath.split('/').some((part) => part === '..') || !isAllowedBlockLookupPreviewFileName(normalizedPath)) {
		return undefined;
	}
	return `image://${BLOCK_LOOKUP_PREVIEW_HOST}/${encodeURI(normalizedPath)}`;
}

export function getBlockLookupPreviewCachePath(userDataPath: string): string {
	return path.join(userDataPath, BLOCK_LOOKUP_PREVIEW_CACHE_DIR);
}

export function resolveBlockLookupPreviewImageRequest(requestUrl: string, userDataPath: string): string | null {
	try {
		const parsed = new URL(requestUrl);
		if (parsed.hostname !== BLOCK_LOOKUP_PREVIEW_HOST) {
			return null;
		}
		const cacheRelativePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
		const cacheRoot = normalizePreviewPath(getBlockLookupPreviewCachePath(userDataPath));
		const resolvedPath = normalizePreviewPath(path.join(cacheRoot, cacheRelativePath));
		const relativePath = path.relative(cacheRoot, resolvedPath);
		if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
			return null;
		}
		if (!isAllowedBlockLookupPreviewFileName(resolvedPath) || !fs.existsSync(resolvedPath)) {
			return null;
		}
		return resolvedPath;
	} catch (error) {
		log.error(`Failed to resolve block lookup preview image request for ${requestUrl}`);
		log.error(error);
		return null;
	}
}

interface PreviewProtocolOptions {
	getUserDataPath?: () => string;
}

function createPreviewProtocolHandler(options: PreviewProtocolOptions = {}) {
	return (request: ProtocolRequest, callback: (response: string | ProtocolResponse) => void) => {
		const parsedUrl = new URL(request.url);
		const resolvedPath =
			parsedUrl.hostname === BLOCK_LOOKUP_PREVIEW_HOST && options.getUserDataPath
				? resolveBlockLookupPreviewImageRequest(request.url, options.getUserDataPath())
				: resolvePreviewImageRequest(request.url);
		if (!resolvedPath) {
			callback({ error: NOT_FOUND_ERROR });
			return;
		}
		callback(resolvedPath);
	};
}

export function registerPreviewProtocol(protocol: Protocol, options: PreviewProtocolOptions = {}) {
	protocol.registerFileProtocol('image', createPreviewProtocolHandler(options));
}

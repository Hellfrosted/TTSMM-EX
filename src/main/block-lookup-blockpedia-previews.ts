import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import log from 'electron-log';
import type { BlockLookupBundlePreviewAsset } from './block-lookup-bundle-text-assets';

const BLOCKPEDIA_URL = 'https://terratechgame.com/blockpedia/';
const BLOCKPEDIA_CACHE_DIR = 'blockpedia';
const BLOCKPEDIA_MANIFEST_FILENAME = 'manifest.json';
const BLOCKPEDIA_MANIFEST_VERSION = 1;

interface BlockpediaPreviewEntry {
	assetName: string;
	blockName: string;
	cacheRelativePath: string;
	corporation: string;
	grade: string;
	imageUrl: string;
	height: number;
	width: number;
}

interface BlockpediaPreviewManifest {
	entries: BlockpediaPreviewEntry[];
	fetchedAt: string;
	sourceUrl: string;
	version: typeof BLOCKPEDIA_MANIFEST_VERSION;
}

interface BlockpediaPreviewFetchResponse {
	arrayBuffer(): Promise<ArrayBuffer>;
	ok: boolean;
	status: number;
	text(): Promise<string>;
}

type BlockpediaPreviewFetch = (url: string) => Promise<BlockpediaPreviewFetchResponse>;

interface LoadBlockpediaPreviewOptions {
	fetchImpl?: BlockpediaPreviewFetch;
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

function stripHtml(value: string): string {
	return decodeHtmlEntities(
		value
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function getAttribute(html: string, attributeName: string): string | undefined {
	const match = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, 'i').exec(html);
	return match ? decodeHtmlEntities(match[1]) : undefined;
}

function getImageAssetName(imageUrl: string): string {
	return path.basename(new URL(imageUrl).pathname).replace(/\.[^.]+$/, '');
}

function createCacheRelativePath(imageUrl: string): string {
	const parsedUrl = new URL(imageUrl);
	const extension = path.extname(parsedUrl.pathname).toLowerCase() || '.jpg';
	const assetName = getImageAssetName(imageUrl).replace(/[^A-Za-z0-9_-]+/g, '_');
	const hash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 12);
	return `${BLOCKPEDIA_CACHE_DIR}/${assetName}-${hash}${extension}`;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseBlockpediaPreviewEntries(html: string): BlockpediaPreviewEntry[] {
	const entries: BlockpediaPreviewEntry[] = [];
	const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
	for (const rowMatch of html.matchAll(rowRegex)) {
		const row = rowMatch[1];
		const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
		if (cells.length < 4) {
			continue;
		}

		const imageHtml = cells[0];
		const imageUrl = getAttribute(imageHtml, 'data-original') ?? getAttribute(imageHtml, 'src');
		if (!imageUrl) {
			continue;
		}
		const parsedImageUrl = new URL(imageUrl, BLOCKPEDIA_URL);
		if (parsedImageUrl.hostname !== 'terratechgame.com' || !/\/assets\/images\/blockpedia\//.test(parsedImageUrl.pathname)) {
			continue;
		}

		const corporation = stripHtml(cells[1]);
		const grade = stripHtml(cells[2]);
		const blockName = stripHtml(cells[3]);
		if (!corporation || !grade || !blockName) {
			continue;
		}

		const assetName = getImageAssetName(parsedImageUrl.toString());
		entries.push({
			assetName: `${assetName} ${blockName}`,
			blockName,
			cacheRelativePath: createCacheRelativePath(parsedImageUrl.toString()),
			corporation,
			grade,
			height: parsePositiveInteger(getAttribute(imageHtml, 'height')) ?? 128,
			imageUrl: parsedImageUrl.toString(),
			width: parsePositiveInteger(getAttribute(imageHtml, 'width')) ?? 128
		});
	}
	return entries;
}

function getManifestPath(previewCacheDir: string): string {
	return path.join(previewCacheDir, BLOCKPEDIA_CACHE_DIR, BLOCKPEDIA_MANIFEST_FILENAME);
}

function readCachedManifest(previewCacheDir: string): BlockpediaPreviewManifest | undefined {
	const manifestPath = getManifestPath(previewCacheDir);
	if (!fs.existsSync(manifestPath)) {
		return undefined;
	}
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BlockpediaPreviewManifest;
		if (
			manifest.version !== BLOCKPEDIA_MANIFEST_VERSION ||
			manifest.sourceUrl !== BLOCKPEDIA_URL ||
			!Array.isArray(manifest.entries) ||
			!manifest.entries.every((entry) => fs.existsSync(path.join(previewCacheDir, entry.cacheRelativePath)))
		) {
			return undefined;
		}
		return manifest;
	} catch (error) {
		log.warn('Failed to read Blockpedia preview manifest.');
		log.warn(error);
		return undefined;
	}
}

function writeManifest(previewCacheDir: string, manifest: BlockpediaPreviewManifest) {
	const manifestPath = getManifestPath(previewCacheDir);
	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const downloadBlockpediaPreviewImages = Effect.fnUntraced(function* (
	previewCacheDir: string,
	entries: readonly BlockpediaPreviewEntry[],
	fetchImpl: BlockpediaPreviewFetch
): Effect.fn.Return<BlockpediaPreviewEntry[]> {
	const cachedEntries: BlockpediaPreviewEntry[] = [];
	for (const entry of entries) {
		const cachePath = path.join(previewCacheDir, entry.cacheRelativePath);
		if (!fs.existsSync(cachePath)) {
			const imageResponse = yield* Effect.tryPromise({
				try: () => fetchImpl(entry.imageUrl),
				catch: (error) => error
			}).pipe(
				Effect.catch((error) => {
					log.warn(`Failed to cache Blockpedia preview ${entry.imageUrl}`);
					log.warn(error);
					return Effect.succeed(null);
				})
			);
			if (!imageResponse?.ok) {
				continue;
			}
			const imageBytes = yield* Effect.tryPromise({
				try: () => imageResponse.arrayBuffer(),
				catch: (error) => error
			}).pipe(
				Effect.catch((error) => {
					log.warn(`Failed to cache Blockpedia preview ${entry.imageUrl}`);
					log.warn(error);
					return Effect.succeed(null);
				})
			);
			if (!imageBytes) {
				continue;
			}
			try {
				fs.mkdirSync(path.dirname(cachePath), { recursive: true });
				fs.writeFileSync(cachePath, Buffer.from(imageBytes));
			} catch (error) {
				log.warn(`Failed to cache Blockpedia preview ${entry.imageUrl}`);
				log.warn(error);
				continue;
			}
		}
		cachedEntries.push(entry);
	}
	return cachedEntries;
});

function toPreviewAssets(entries: readonly BlockpediaPreviewEntry[]): BlockLookupBundlePreviewAsset[] {
	return entries.map((entry) => ({
		assetName: entry.assetName,
		cacheRelativePath: entry.cacheRelativePath,
		height: entry.height,
		width: entry.width
	}));
}

export const loadBlockpediaVanillaPreviewAssets = Effect.fnUntraced(function* (
	previewCacheDir: string,
	options: LoadBlockpediaPreviewOptions = {}
): Effect.fn.Return<BlockLookupBundlePreviewAsset[]> {
	const cachedManifest = readCachedManifest(previewCacheDir);
	if (cachedManifest) {
		return toPreviewAssets(cachedManifest.entries);
	}

	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (!fetchImpl) {
		return [];
	}

	const pageResponse = yield* Effect.tryPromise({
		try: () => fetchImpl(BLOCKPEDIA_URL),
		catch: (error) => error
	}).pipe(
		Effect.catch((error) => {
			log.warn('Failed to load Blockpedia vanilla previews.');
			log.warn(error);
			return Effect.succeed(null);
		})
	);
	if (!pageResponse?.ok) {
		return [];
	}
	const pageText = yield* Effect.tryPromise({
		try: () => pageResponse.text(),
		catch: (error) => error
	}).pipe(
		Effect.catch((error) => {
			log.warn('Failed to load Blockpedia vanilla previews.');
			log.warn(error);
			return Effect.succeed(null);
		})
	);
	if (pageText === null) {
		return [];
	}
	try {
		const entries = parseBlockpediaPreviewEntries(pageText);
		const cachedEntries = yield* downloadBlockpediaPreviewImages(previewCacheDir, entries, fetchImpl);
		const manifest: BlockpediaPreviewManifest = {
			entries: cachedEntries,
			fetchedAt: new Date().toISOString(),
			sourceUrl: BLOCKPEDIA_URL,
			version: BLOCKPEDIA_MANIFEST_VERSION
		};
		writeManifest(previewCacheDir, manifest);
		return toPreviewAssets(manifest.entries);
	} catch (error) {
		log.warn('Failed to load Blockpedia vanilla previews.');
		log.warn(error);
		return [];
	}
});

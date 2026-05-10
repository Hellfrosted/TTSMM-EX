import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import log from 'electron-log';
import type { BlockLookupTextAsset } from './block-lookup-nuterra-text';

interface ExtractorFileResult {
	sourcePath: string;
	textAssets: BlockLookupTextAsset[];
	errors?: string[];
}

interface ExtractorOutput {
	version: 1;
	files: ExtractorFileResult[];
}

interface BlockLookupBundleTextAssetOptions {
	allowEmbeddedFallback?: boolean;
	extractorPath?: string | null;
}

const execFileAsync = promisify(childProcess.execFile);

function getExecutableName() {
	return process.platform === 'win32' ? 'block-lookup-extractor.exe' : 'block-lookup-extractor';
}

function getBlockLookupExtractorCandidates() {
	const executableName = getExecutableName();
	const configuredPath = process.env.TTSMM_BLOCK_LOOKUP_EXTRACTOR_PATH?.trim();
	return [
		configuredPath || null,
		path.join(process.resourcesPath || '', 'bin', executableName),
		path.join(process.cwd(), 'release', 'app', 'bin', executableName),
		path.join(process.cwd(), 'native', 'block-lookup-extractor', 'target', 'release', executableName)
	].filter((candidate): candidate is string => Boolean(candidate));
}

function findBlockLookupExtractorPath() {
	return getBlockLookupExtractorCandidates().find((candidate) => fs.existsSync(candidate)) || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object';
}

function isExtractorTextAsset(value: unknown): value is BlockLookupTextAsset {
	return isRecord(value) && typeof value.assetName === 'string' && typeof value.text === 'string';
}

function isExtractorFileResult(value: unknown): value is ExtractorFileResult {
	return (
		isRecord(value) &&
		typeof value.sourcePath === 'string' &&
		Array.isArray(value.textAssets) &&
		value.textAssets.every(isExtractorTextAsset) &&
		(value.errors === undefined || (Array.isArray(value.errors) && value.errors.every((error) => typeof error === 'string')))
	);
}

function parseExtractorOutput(stdout: string): ExtractorOutput {
	const parsed = JSON.parse(stdout) as unknown;
	if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.files) || !parsed.files.every(isExtractorFileResult)) {
		throw new Error('Block Lookup extractor returned an unsupported JSON shape.');
	}
	return {
		version: 1,
		files: parsed.files
	};
}

function extractBundleTextAssetsByEmbeddedText(sourcePath: string): BlockLookupTextAsset[] {
	const buffer = fs.readFileSync(sourcePath);
	const assetName = path.basename(sourcePath, path.extname(sourcePath));
	return [buffer.toString('utf8'), buffer.toString('utf16le')]
		.filter((text) => text.includes('NuterraBlock'))
		.map((text) => ({
			assetName,
			text
		}));
}

function extractBundleTextAssetsFallback(sourcePaths: readonly string[]): Map<string, BlockLookupTextAsset[]> {
	const results = new Map<string, BlockLookupTextAsset[]>();
	for (const sourcePath of sourcePaths) {
		try {
			results.set(sourcePath, extractBundleTextAssetsByEmbeddedText(sourcePath));
		} catch (error) {
			log.warn(`Failed to index block bundle source ${sourcePath}`);
			log.warn(error);
			results.set(sourcePath, []);
		}
	}
	return results;
}

function shouldUseEmbeddedFallback(allowEmbeddedFallback = process.env.NODE_ENV !== 'production') {
	return allowEmbeddedFallback;
}

export async function extractBundleTextAssets(
	sourcePaths: readonly string[],
	options: BlockLookupBundleTextAssetOptions = {}
): Promise<Map<string, BlockLookupTextAsset[]>> {
	const extractorPath = options.extractorPath === undefined ? findBlockLookupExtractorPath() : options.extractorPath;
	if (!extractorPath) {
		if (!shouldUseEmbeddedFallback(options.allowEmbeddedFallback)) {
			throw new Error('Block Lookup native extractor is unavailable in a packaged runtime.');
		}
		log.warn('Block Lookup native extractor is unavailable; falling back to embedded text scanning.');
		return extractBundleTextAssetsFallback(sourcePaths);
	}

	try {
		const { stdout, stderr } = await execFileAsync(extractorPath, sourcePaths, {
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			timeout: 120000,
			windowsHide: true
		});
		if (stderr.trim()) {
			log.warn(`Block Lookup native extractor stderr: ${stderr.trim()}`);
		}
		const output = parseExtractorOutput(stdout);
		const results = new Map<string, BlockLookupTextAsset[]>();
		sourcePaths.forEach((sourcePath) => results.set(sourcePath, []));
		output.files.forEach((file) => {
			if (file.errors?.length) {
				log.warn(`Block Lookup native extractor reported issues for ${file.sourcePath}: ${file.errors.join('; ')}`);
			}
			results.set(file.sourcePath, file.textAssets);
		});
		return results;
	} catch (error) {
		if (!shouldUseEmbeddedFallback(options.allowEmbeddedFallback)) {
			log.warn('Block Lookup native extractor failed in a packaged runtime.');
			log.warn(error);
			throw error;
		}
		log.warn('Block Lookup native extractor failed; falling back to embedded text scanning.');
		log.warn(error);
		return extractBundleTextAssetsFallback(sourcePaths);
	}
}

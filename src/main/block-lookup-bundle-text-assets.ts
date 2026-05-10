import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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
	maxEmbeddedFallbackBytes?: number;
}

export interface BlockLookupBundleTextAssetExtractionOutcome {
	issues: string[];
	sourcePath: string;
	status: 'success' | 'issue';
	textAssets: BlockLookupTextAsset[];
}

const MAX_EMBEDDED_BUNDLE_FALLBACK_BYTES = 32 * 1024 * 1024;

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

function extractBundleTextAssetsByEmbeddedText(
	sourcePath: string,
	maxEmbeddedFallbackBytes = MAX_EMBEDDED_BUNDLE_FALLBACK_BYTES
): BlockLookupTextAsset[] {
	const sourceFd = fs.openSync(sourcePath, 'r');
	let buffer: Buffer;
	try {
		const stats = fs.fstatSync(sourceFd);
		if (!stats.isFile()) {
			throw new Error(`Block Lookup bundle source is not a regular file: ${sourcePath}`);
		}
		if (stats.size > maxEmbeddedFallbackBytes) {
			throw new Error(`Block Lookup bundle source exceeds embedded fallback size limit: ${sourcePath}`);
		}

		buffer = Buffer.alloc(stats.size);
		let bytesRead = 0;
		while (bytesRead < buffer.length) {
			const readCount = fs.readSync(sourceFd, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
			if (readCount === 0) {
				break;
			}
			bytesRead += readCount;
		}
		if (bytesRead < buffer.length) {
			buffer = buffer.subarray(0, bytesRead);
		}
	} finally {
		fs.closeSync(sourceFd);
	}

	const assetName = path.basename(sourcePath, path.extname(sourcePath));
	return [buffer.toString('utf8'), buffer.toString('utf16le')]
		.filter((text) => text.includes('NuterraBlock'))
		.map((text) => ({
			assetName,
			text
		}));
}

function getExtractionIssueMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function extractBundleTextAssetOutcomesFallback(
	sourcePaths: readonly string[],
	maxEmbeddedFallbackBytes?: number
): Map<string, BlockLookupBundleTextAssetExtractionOutcome> {
	const results = new Map<string, BlockLookupBundleTextAssetExtractionOutcome>();
	for (const sourcePath of sourcePaths) {
		try {
			results.set(sourcePath, {
				issues: [],
				sourcePath,
				status: 'success',
				textAssets: extractBundleTextAssetsByEmbeddedText(sourcePath, maxEmbeddedFallbackBytes)
			});
		} catch (error) {
			log.warn(`Failed to index block bundle source ${sourcePath}`);
			log.warn(error);
			results.set(sourcePath, {
				issues: [getExtractionIssueMessage(error)],
				sourcePath,
				status: 'issue',
				textAssets: []
			});
		}
	}
	return results;
}

function shouldUseEmbeddedFallback(allowEmbeddedFallback = process.env.NODE_ENV !== 'production') {
	return allowEmbeddedFallback;
}

function runBundleTextAssetExtractor(extractorPath: string, sourcePaths: readonly string[]) {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		childProcess.execFile(
			extractorPath,
			[...sourcePaths],
			{
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
				timeout: 120000,
				windowsHide: true
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}
				resolve({
					stdout: String(stdout),
					stderr: String(stderr)
				});
			}
		);
	});
}

export async function extractBundleTextAssetOutcomes(
	sourcePaths: readonly string[],
	options: BlockLookupBundleTextAssetOptions = {}
): Promise<Map<string, BlockLookupBundleTextAssetExtractionOutcome>> {
	const extractorPath = options.extractorPath === undefined ? findBlockLookupExtractorPath() : options.extractorPath;
	if (!extractorPath) {
		if (!shouldUseEmbeddedFallback(options.allowEmbeddedFallback)) {
			throw new Error('Block Lookup native extractor is unavailable in a packaged runtime.');
		}
		log.warn('Block Lookup native extractor is unavailable; falling back to embedded text scanning.');
		return extractBundleTextAssetOutcomesFallback(sourcePaths, options.maxEmbeddedFallbackBytes);
	}

	try {
		const { stdout, stderr } = await runBundleTextAssetExtractor(extractorPath, sourcePaths);
		if (stderr.trim()) {
			log.warn(`Block Lookup native extractor stderr: ${stderr.trim()}`);
		}
		const output = parseExtractorOutput(stdout);
		const results = new Map<string, BlockLookupBundleTextAssetExtractionOutcome>();
		sourcePaths.forEach((sourcePath) =>
			results.set(sourcePath, {
				issues: ['Block Lookup native extractor did not return a result for this source.'],
				sourcePath,
				status: 'issue',
				textAssets: []
			})
		);
		output.files.forEach((file) => {
			if (file.errors?.length) {
				log.warn(`Block Lookup native extractor reported issues for ${file.sourcePath}: ${file.errors.join('; ')}`);
			}
			const issues = file.errors ?? [];
			results.set(file.sourcePath, {
				issues,
				sourcePath: file.sourcePath,
				status: issues.length ? 'issue' : 'success',
				textAssets: file.textAssets
			});
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
		return extractBundleTextAssetOutcomesFallback(sourcePaths, options.maxEmbeddedFallbackBytes);
	}
}

export async function extractBundleTextAssets(
	sourcePaths: readonly string[],
	options: BlockLookupBundleTextAssetOptions = {}
): Promise<Map<string, BlockLookupTextAsset[]>> {
	const outcomes = await extractBundleTextAssetOutcomes(sourcePaths, options);
	return new Map([...outcomes].map(([sourcePath, outcome]) => [sourcePath, outcome.textAssets]));
}

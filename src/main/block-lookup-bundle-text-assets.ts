import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import type { BlockLookupTextAsset } from './block-lookup-nuterra-text';

interface ExtractorFileResult {
	sourcePath: string;
	textAssets: BlockLookupTextAsset[];
	errors: string[];
}

interface ExtractorOutput {
	version: 1;
	files: ExtractorFileResult[];
}

interface BlockLookupBundleTextAssetOptions {
	extractorPath?: string | null;
}

export interface BlockLookupBundleTextAssetExtractionOutcome {
	issues: string[];
	sourcePath: string;
	status: 'success' | 'issue';
	textAssets: BlockLookupTextAsset[];
}

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
		Array.isArray(value.errors) &&
		value.errors.every((error) => typeof error === 'string')
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
		throw new Error('Block Lookup native extractor is unavailable.');
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
			if (file.errors.length) {
				log.warn(`Block Lookup native extractor reported issues for ${file.sourcePath}: ${file.errors.join('; ')}`);
			}
			const issues = file.errors;
			results.set(file.sourcePath, {
				issues,
				sourcePath: file.sourcePath,
				status: issues.length ? 'issue' : 'success',
				textAssets: file.textAssets
			});
		});
		return results;
	} catch (error) {
		log.warn('Block Lookup native extractor failed.');
		log.warn(error);
		throw error;
	}
}

export async function extractBundleTextAssets(
	sourcePaths: readonly string[],
	options: BlockLookupBundleTextAssetOptions = {}
): Promise<Map<string, BlockLookupTextAsset[]>> {
	const outcomes = await extractBundleTextAssetOutcomes(sourcePaths, options);
	return new Map([...outcomes].map(([sourcePath, outcome]) => [sourcePath, outcome.textAssets]));
}

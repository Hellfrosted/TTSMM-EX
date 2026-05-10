import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log';
import { Effect } from 'effect';
import type { BlockLookupTextAsset } from './block-lookup-nuterra-text';

const EXTRACTOR_SOURCE_BATCH_SIZE = 1;

interface ExtractorFileResult {
	sourcePath: string;
	textAssets: BlockLookupTextAsset[];
	previewAssets: BlockLookupBundlePreviewAsset[];
	errors: string[];
}

interface ExtractorOutput {
	version: 2;
	files: ExtractorFileResult[];
}

interface BlockLookupBundleExtractionOptions {
	extractorPath?: string | null;
	previewCacheDir?: string;
	previewMatchNames?: readonly string[];
}

export interface BlockLookupBundleExtractionOutcome {
	issues: string[];
	previewAssets: BlockLookupBundlePreviewAsset[];
	sourcePath: string;
	status: 'success' | 'issue';
	textAssets: BlockLookupTextAsset[];
}

export interface BlockLookupBundlePreviewAsset {
	assetName: string;
	cacheRelativePath: string;
	height?: number;
	width?: number;
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

function isPositiveFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isExtractorPreviewAsset(value: unknown): value is BlockLookupBundlePreviewAsset {
	return (
		isRecord(value) &&
		typeof value.assetName === 'string' &&
		typeof value.cacheRelativePath === 'string' &&
		(value.width === undefined || isPositiveFiniteNumber(value.width)) &&
		(value.height === undefined || isPositiveFiniteNumber(value.height))
	);
}

function isExtractorFileResult(value: unknown): value is ExtractorFileResult {
	return (
		isRecord(value) &&
		typeof value.sourcePath === 'string' &&
		Array.isArray(value.textAssets) &&
		value.textAssets.every(isExtractorTextAsset) &&
		Array.isArray(value.previewAssets) &&
		value.previewAssets.every(isExtractorPreviewAsset) &&
		Array.isArray(value.errors) &&
		value.errors.every((error) => typeof error === 'string')
	);
}

function parseExtractorOutput(stdout: string): ExtractorOutput {
	const parsed = JSON.parse(stdout) as unknown;
	if (!isRecord(parsed) || parsed.version !== 2 || !Array.isArray(parsed.files) || !parsed.files.every(isExtractorFileResult)) {
		throw new Error('Block Lookup extractor returned an unsupported JSON shape.');
	}
	return {
		version: 2,
		files: parsed.files
	};
}

interface BlockLookupBundleExtractionRunOptions extends BlockLookupBundleExtractionOptions {
	previewMatchNamesFile?: string;
}

const runBlockLookupBundleExtractor = Effect.fnUntraced(function* (
	extractorPath: string,
	sourcePaths: readonly string[],
	options: BlockLookupBundleExtractionRunOptions
): Effect.fn.Return<{ stdout: string; stderr: string }, unknown> {
	return yield* Effect.tryPromise({
		try: () =>
			new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
				childProcess.execFile(
					extractorPath,
					[...sourcePaths],
					{
						encoding: 'utf8',
						env: {
							...process.env,
							...(options.previewCacheDir ? { TTSMM_BLOCK_LOOKUP_PREVIEW_CACHE_DIR: options.previewCacheDir } : {}),
							...(options.previewMatchNamesFile ? { TTSMM_BLOCK_LOOKUP_PREVIEW_MATCH_NAMES_FILE: options.previewMatchNamesFile } : {})
						},
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
			}),
		catch: (error) => error
	});
});

function createPreviewMatchNamesFile(previewMatchNames: readonly string[] | undefined): { directory: string; filePath: string } | null {
	const uniqueNames = [
		...new Set(
			(previewMatchNames ?? []).flatMap((name) => {
				const trimmedName = name.trim();
				return trimmedName ? [trimmedName] : [];
			})
		)
	];
	if (!uniqueNames.length) {
		return null;
	}
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-block-lookup-preview-match-'));
	const filePath = path.join(directory, 'names.txt');
	fs.writeFileSync(filePath, uniqueNames.join('\n'), 'utf8');
	return { directory, filePath };
}

function createExtractorSourceBatches(sourcePaths: readonly string[]): string[][] {
	const batches: string[][] = [];
	for (let index = 0; index < sourcePaths.length; index += EXTRACTOR_SOURCE_BATCH_SIZE) {
		batches.push(sourcePaths.slice(index, index + EXTRACTOR_SOURCE_BATCH_SIZE));
	}
	return batches;
}

export const extractBlockLookupBundleOutcomes = Effect.fnUntraced(function* (
	sourcePaths: readonly string[],
	options: BlockLookupBundleExtractionOptions = {}
): Effect.fn.Return<Map<string, BlockLookupBundleExtractionOutcome>, unknown> {
	const extractorPath = options.extractorPath === undefined ? findBlockLookupExtractorPath() : options.extractorPath;
	if (!extractorPath) {
		return yield* Effect.fail(new Error('Block Lookup native extractor is unavailable.'));
	}

	const previewMatchNamesFile = createPreviewMatchNamesFile(options.previewMatchNames);
	const outputs = yield* Effect.gen(function* () {
		const outputs: ExtractorOutput[] = [];
		for (const batch of createExtractorSourceBatches(sourcePaths)) {
			const { stdout, stderr } = yield* runBlockLookupBundleExtractor(extractorPath, batch, {
				...options,
				...(previewMatchNamesFile ? { previewMatchNamesFile: previewMatchNamesFile.filePath } : {})
			});
			if (stderr.trim()) {
				log.warn(`Block Lookup native extractor stderr: ${stderr.trim()}`);
			}
			const output = yield* Effect.try({
				try: () => parseExtractorOutput(stdout),
				catch: (error) => error
			});
			outputs.push(output);
		}
		return outputs;
	}).pipe(
		Effect.ensuring(
			Effect.sync(() => {
				if (previewMatchNamesFile) {
					fs.rmSync(previewMatchNamesFile.directory, { force: true, recursive: true });
				}
			})
		),
		Effect.catch((error) => {
			log.warn('Block Lookup native extractor failed.');
			log.warn(error);
			return Effect.fail(error);
		})
	);
	const results = new Map<string, BlockLookupBundleExtractionOutcome>();
	sourcePaths.forEach((sourcePath) =>
		results.set(sourcePath, {
			issues: ['Block Lookup native extractor did not return a result for this source.'],
			previewAssets: [],
			sourcePath,
			status: 'issue',
			textAssets: []
		})
	);
	for (const output of outputs) {
		for (const file of output.files) {
			if (file.errors.length) {
				log.warn(`Block Lookup native extractor reported issues for ${file.sourcePath}: ${file.errors.join('; ')}`);
			}
			const issues = file.errors;
			results.set(file.sourcePath, {
				issues,
				previewAssets: file.previewAssets,
				sourcePath: file.sourcePath,
				status: issues.length ? 'issue' : 'success',
				textAssets: file.textAssets
			});
		}
	}
	return results;
});

export const extractBundleTextAssets = Effect.fnUntraced(function* (
	sourcePaths: readonly string[],
	options: BlockLookupBundleExtractionOptions = {}
): Effect.fn.Return<Map<string, BlockLookupTextAsset[]>, unknown> {
	const outcomes = yield* extractBlockLookupBundleOutcomes(sourcePaths, options);
	return new Map([...outcomes].map(([sourcePath, outcome]) => [sourcePath, outcome.textAssets]));
});

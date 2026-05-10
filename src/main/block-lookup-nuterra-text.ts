import fs from 'node:fs';
import path from 'node:path';
import type { BlockLookupPreviewBounds, BlockLookupRecord } from 'shared/block-lookup';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';

const NAME_RE = /"Name"\s*:\s*"([^"]+)"/i;
const ID_RE = /"ID"\s*:\s*(\d+)/i;
const UNITY_NAME_RE = /"m_Name"\s*:\s*"([^"]+)"/i;
const BLOCK_EXTENTS_RE = /"BlockExtents"\s*:\s*\{([\s\S]*?)\}/i;
const BUNDLE_SCAN_CONTEXT_CHARS = 8192;

export interface ExtractedTextBlock {
	blockName: string;
	blockId: string;
	internalName: string;
	previewBounds?: BlockLookupPreviewBounds;
}

export interface BlockLookupTextAsset {
	assetName: string;
	text: string;
}

function observedNormalize(value: string): string {
	const placeholder = '<<DASHSEP>>';
	return value.replace(/ - /g, placeholder).replace(/-/g, '_').trim().replace(/\s+/g, '_').replace(new RegExp(placeholder, 'g'), '_-_');
}

function strictNormalize(value: string): string {
	return value
		.trim()
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

export function normalizedBlockLookupKey(value: string): string {
	return value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
}

export function humanizeBlockLookupIdentifier(value: string): string {
	return value
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();
}

function readBlockLookupNumberProperty(text: string, propertyName: keyof BlockLookupPreviewBounds): number | undefined {
	const match = new RegExp(`"${propertyName}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i').exec(text);
	const value = match ? Number(match[1]) : undefined;
	return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseBlockLookupPreviewBounds(text: string): BlockLookupPreviewBounds | undefined {
	const extentsBody = BLOCK_EXTENTS_RE.exec(text)?.[1];
	if (!extentsBody) {
		return undefined;
	}
	const x = readBlockLookupNumberProperty(extentsBody, 'x');
	const y = readBlockLookupNumberProperty(extentsBody, 'y');
	const z = readBlockLookupNumberProperty(extentsBody, 'z');
	return x && y && z ? { x, y, z } : undefined;
}

function hasNamelessNuterraBlockShape(text: string): boolean {
	return /"NuterraBlock"\s*:\s*\{/i.test(text);
}

export function buildBlockLookupAliases(blockName: string, modTitle: string): { preferredAlias: string; fallbackAlias: string } {
	return {
		preferredAlias: `${observedNormalize(blockName)}(${observedNormalize(modTitle)})`,
		fallbackAlias: `${strictNormalize(blockName)}(${strictNormalize(modTitle)})`
	};
}

export function createBlockLookupRecord(
	source: BlockLookupSourceRecord,
	block: ExtractedTextBlock,
	aliases = buildBlockLookupAliases(block.blockName, source.modTitle)
): BlockLookupRecord {
	return {
		blockName: block.blockName,
		internalName: block.internalName,
		blockId: block.blockId,
		modTitle: source.modTitle,
		workshopId: source.workshopId,
		sourceKind: source.sourceKind,
		sourcePath: source.sourcePath,
		previewBounds: block.previewBounds,
		preferredAlias: aliases.preferredAlias,
		fallbackAlias: aliases.fallbackAlias,
		spawnCommand: `SpawnBlock ${aliases.preferredAlias}`,
		fallbackSpawnCommand: `SpawnBlock ${aliases.fallbackAlias}`
	};
}

function parseNuterraBlockText(text: string, fallbackInternalName: string): ExtractedTextBlock | null {
	const explicitName = NAME_RE.exec(text)?.[1]?.trim();
	const name = explicitName || (hasNamelessNuterraBlockShape(text) ? humanizeBlockLookupIdentifier(fallbackInternalName) : '');
	if (!name) {
		return null;
	}

	return {
		blockName: name,
		blockId: ID_RE.exec(text)?.[1] || '',
		internalName: UNITY_NAME_RE.exec(text)?.[1]?.trim() || fallbackInternalName,
		previewBounds: parseBlockLookupPreviewBounds(text)
	};
}

export function extractNuterraBlocksFromText(text: string, fallbackInternalName: string): ExtractedTextBlock[] {
	if (!text.includes('NuterraBlock')) {
		return [];
	}

	const records: ExtractedTextBlock[] = [];
	const seen = new Set<string>();
	let cursor = 0;
	while (cursor < text.length) {
		const index = text.indexOf('NuterraBlock', cursor);
		if (index < 0) {
			break;
		}

		const start = Math.max(0, index - BUNDLE_SCAN_CONTEXT_CHARS);
		const end = Math.min(text.length, index + BUNDLE_SCAN_CONTEXT_CHARS);
		const parsed = parseNuterraBlockText(text.slice(start, end), fallbackInternalName);
		if (parsed) {
			const key = `${normalizedBlockLookupKey(parsed.blockName)}:${parsed.blockId}:${parsed.internalName}`;
			if (!seen.has(key)) {
				seen.add(key);
				records.push(parsed);
			}
		}
		cursor = index + 'NuterraBlock'.length;
	}

	return records;
}

function isExtractedTextBlock(value: unknown): value is ExtractedTextBlock {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const record = value as ExtractedTextBlock;
	return typeof record.blockName === 'string' && typeof record.blockId === 'string' && typeof record.internalName === 'string';
}

function toUniqueBlocks(blocks: ExtractedTextBlock[]) {
	const uniqueBlocks = new Map<string, ExtractedTextBlock>();
	blocks.filter(isExtractedTextBlock).forEach((block) => {
		uniqueBlocks.set(`${normalizedBlockLookupKey(block.blockName)}:${block.blockId}:${block.internalName}`, block);
	});
	return [...uniqueBlocks.values()];
}

function extractBlocksFromTextAssets(sourcePath: string, textAssets: readonly BlockLookupTextAsset[]) {
	const fallbackInternalName = path.basename(sourcePath, path.extname(sourcePath));
	return toUniqueBlocks(textAssets.flatMap((asset) => extractNuterraBlocksFromText(asset.text, asset.assetName || fallbackInternalName)));
}

export function createBlockLookupRecordsFromTextAssets(source: BlockLookupSourceRecord, textAssets: readonly BlockLookupTextAsset[]) {
	return extractBlocksFromTextAssets(source.sourcePath, textAssets).map((block) => createBlockLookupRecord(source, block));
}

export function readBlockLookupSourceTextAsset(sourcePath: string): BlockLookupTextAsset {
	return {
		assetName: path.basename(sourcePath, path.extname(sourcePath)),
		text: fs.readFileSync(sourcePath).toString('utf8')
	};
}

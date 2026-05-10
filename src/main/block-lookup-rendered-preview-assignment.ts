import type { BlockLookupRecord } from 'shared/block-lookup';
import { normalizedBlockLookupKey } from './block-lookup-nuterra-text';

export interface BlockLookupRenderedPreviewAsset {
	assetName: string;
	cacheRelativePath: string;
	width?: number;
	height?: number;
}

export interface BlockLookupRenderedPreviewAssignmentOptions {
	renderedPreviewsEnabled?: boolean;
}

export function getBlockLookupRecordPreviewMatchNameCandidates(records: readonly BlockLookupRecord[]): string[] {
	return [
		...new Set(
			records
				.flatMap((record) => [
					record.internalName,
					record.blockName,
					record.preferredAlias.replace(/\(.*$/, ''),
					...(record.previewAssetNames ?? [])
				])
				.map((value) => value.trim())
				.filter(Boolean)
		)
	];
}

function normalizePreviewAssetMatchKey(value: string): string {
	return normalizedBlockLookupKey(value).replace(/(renderedpreview|thumbnail|preview|thumb|icon|texture|sprite)$/g, '');
}

const PREVIEW_MATCH_SUFFIX_TOKENS = new Set(['rendered', 'preview', 'thumbnail', 'thumb', 'icon', 'texture', 'sprite']);
const PREVIEW_MATCH_GENERIC_TOKENS = new Set(['acc', 'block', 'standard', 'ver', 'steam']);
const PREVIEW_MATCH_CORP_TOKENS = new Set(['bf', 'gc', 'gso', 'he', 'lk', 'rr', 'sj', 'tac', 'ven']);
const PREVIEW_MATCH_CATEGORY_TOKENS = new Set([
	'armor',
	'armour',
	'battery',
	'cannon',
	'gun',
	'plate',
	'railgun',
	'turret',
	'weapon',
	'wheel'
]);
const PREVIEW_MATCH_VARIANT_TOKEN_GROUPS = [new Set(['center', 'left', 'right']), new Set(['large', 'medium', 'small', 'xl'])];

function normalizePreviewMatchToken(token: string): string {
	if (token === 'mini') {
		return 'small';
	}
	if (token === 'centre') {
		return 'center';
	}
	if (token === 'railcannon') {
		return 'railgun';
	}
	return token;
}

function tokenizePreviewMatchValue(value: string): string[] {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.map((token) => token.toLowerCase())
		.map(normalizePreviewMatchToken)
		.filter((token) => token.length > 0 && !PREVIEW_MATCH_SUFFIX_TOKENS.has(token) && !PREVIEW_MATCH_GENERIC_TOKENS.has(token));
}

function getPreviewMatchVariantTokens(tokens: ReadonlySet<string>, group: ReadonlySet<string>): string[] {
	return [...group].filter((token) => tokens.has(token));
}

function hasPreviewMatchVariantConflict(recordTokens: ReadonlySet<string>, assetTokens: ReadonlySet<string>): boolean {
	return PREVIEW_MATCH_VARIANT_TOKEN_GROUPS.some((group) => {
		const recordVariants = getPreviewMatchVariantTokens(recordTokens, group);
		const assetVariants = getPreviewMatchVariantTokens(assetTokens, group);
		return recordVariants.length > 0 && assetVariants.length > 0 && recordVariants.every((token) => !assetVariants.includes(token));
	});
}

function isStrongPreviewMatchToken(token: string): boolean {
	return (
		token.length > 2 &&
		!/^\d+$/.test(token) &&
		!PREVIEW_MATCH_CORP_TOKENS.has(token) &&
		!PREVIEW_MATCH_CATEGORY_TOKENS.has(token) &&
		!PREVIEW_MATCH_VARIANT_TOKEN_GROUPS.some((group) => group.has(token))
	);
}

function getRecordPreviewMatchKeys(record: BlockLookupRecord): string[] {
	return getBlockLookupRecordPreviewMatchNameCandidates([record])
		.map(normalizePreviewAssetMatchKey)
		.filter((key) => key.length > 0);
}

function getRecordPreviewMatchTokenSets(record: BlockLookupRecord): string[][] {
	return getBlockLookupRecordPreviewMatchNameCandidates([record])
		.map(tokenizePreviewMatchValue)
		.filter((tokens) => tokens.length >= 2);
}

function scorePreviewTokenMatch(recordTokenSets: readonly string[][], assetName: string): number {
	const assetTokens = new Set(tokenizePreviewMatchValue(assetName));
	if (assetTokens.size < 2) {
		return 0;
	}

	return recordTokenSets.reduce((bestScore, recordTokens) => {
		const uniqueRecordTokens = [...new Set(recordTokens)];
		if (hasPreviewMatchVariantConflict(new Set(uniqueRecordTokens), assetTokens)) {
			return bestScore;
		}
		const matchedTokens = uniqueRecordTokens.filter((token) => assetTokens.has(token));
		const requiredTokenCount = uniqueRecordTokens.length <= 3 ? uniqueRecordTokens.length : Math.max(3, uniqueRecordTokens.length - 1);
		const hasSharedFamilyMatch =
			matchedTokens.length >= 2 &&
			matchedTokens.some(isStrongPreviewMatchToken) &&
			uniqueRecordTokens.filter(isStrongPreviewMatchToken).length >= 2 &&
			assetTokens.size >= 3;
		if (matchedTokens.length < requiredTokenCount && !hasSharedFamilyMatch) {
			return bestScore;
		}
		const missingRecordTokenPenalty = (uniqueRecordTokens.length - matchedTokens.length) * 25;
		const extraAssetTokenPenalty = Math.max(0, assetTokens.size - matchedTokens.length) * 2;
		return Math.max(bestScore, matchedTokens.length * 100 - missingRecordTokenPenalty - extraAssetTokenPenalty);
	}, 0);
}

function scorePreviewAssetForRecord(
	recordKeys: readonly string[],
	recordTokenSets: readonly string[][],
	asset: BlockLookupRenderedPreviewAsset
): number {
	const assetKey = normalizePreviewAssetMatchKey(asset.assetName);
	let keyScore = 0;
	for (const recordKey of recordKeys) {
		if (assetKey === recordKey) {
			keyScore = Math.max(keyScore, 1000 + recordKey.length);
		} else if (assetKey.includes(recordKey)) {
			keyScore = Math.max(keyScore, 800 + recordKey.length);
		} else if (recordKey.includes(assetKey)) {
			keyScore = Math.max(keyScore, 600 + assetKey.length);
		}
	}
	if (asset.cacheRelativePath.startsWith('blockpedia/') && keyScore <= 0) {
		return 0;
	}
	let score = keyScore;
	score = Math.max(score, scorePreviewTokenMatch(recordTokenSets, asset.assetName));
	if (score <= 0) {
		return 0;
	}
	const assetTokens = new Set(tokenizePreviewMatchValue(asset.assetName));
	const rawAssetTokens = new Set(
		asset.assetName
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.split(/[^A-Za-z0-9]+/)
			.map((token) => token.toLowerCase())
	);
	if (rawAssetTokens.has('preview') || rawAssetTokens.has('thumbnail') || rawAssetTokens.has('thumb')) {
		score += 20;
	} else if (rawAssetTokens.has('icon')) {
		score += 10;
	}
	if (assetTokens.size === 0) {
		score = 0;
	}
	if (score > 0 && asset.cacheRelativePath.startsWith('blockpedia/')) {
		score += 5000;
	}
	return score;
}

function findPreviewAssetForRecord(
	record: BlockLookupRecord,
	previewAssets: readonly BlockLookupRenderedPreviewAsset[]
): BlockLookupRenderedPreviewAsset | undefined {
	const recordKeys = getRecordPreviewMatchKeys(record);
	const recordTokenSets = getRecordPreviewMatchTokenSets(record);
	let bestAsset: BlockLookupRenderedPreviewAsset | undefined;
	let bestScore = 0;
	for (const asset of previewAssets) {
		const score = scorePreviewAssetForRecord(recordKeys, recordTokenSets, asset);
		if (score > bestScore) {
			bestAsset = asset;
			bestScore = score;
		}
	}
	return bestAsset;
}

function createRenderedPreviewFromAsset(previewAsset: BlockLookupRenderedPreviewAsset): BlockLookupRecord['renderedPreview'] {
	return {
		cacheRelativePath: previewAsset.cacheRelativePath,
		...(previewAsset.width ? { width: Math.round(previewAsset.width) } : {}),
		...(previewAsset.height ? { height: Math.round(previewAsset.height) } : {})
	};
}

export function assignRenderedBlockPreviewsToRecords(
	records: readonly BlockLookupRecord[],
	previewAssets: readonly BlockLookupRenderedPreviewAsset[],
	options: BlockLookupRenderedPreviewAssignmentOptions | undefined
): BlockLookupRecord[] {
	if (!options?.renderedPreviewsEnabled || previewAssets.length === 0 || records.length === 0) {
		return [...records];
	}

	return records.map((record) => {
		const previewAsset = findPreviewAssetForRecord(record, previewAssets);
		const renderedPreview = previewAsset ? createRenderedPreviewFromAsset(previewAsset) : undefined;
		return renderedPreview ? { ...record, renderedPreview } : record;
	});
}

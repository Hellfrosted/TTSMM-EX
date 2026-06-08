import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import { toEffectOperationError } from 'shared/effect-errors';
import {
	createBlockLookupRecord,
	type ExtractedTextBlock,
	humanizeBlockLookupIdentifier,
	normalizedBlockLookupKey
} from './block-lookup-nuterra-text';
import { assignRenderedBlockPreviewsToRecords } from './block-lookup-rendered-preview-assignment';
import {
	type BlockLookupRenderedPreviewAcquisitionOptions,
	loadVanillaRenderedPreviewAssets
} from './block-lookup-rendered-preview-sources';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';

function buildVanillaExportMap(assemblyPath: string): Map<string, string> {
	const gameRoot = path.resolve(assemblyPath, '..', '..', '..');
	const exportDir = path.join(gameRoot, '_Export', 'BlockJson');
	const exportMap = new Map<string, string>();
	if (!fs.existsSync(exportDir)) {
		return exportMap;
	}

	for (const entry of fs.readdirSync(exportDir, { withFileTypes: true })) {
		if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
			continue;
		}
		const stem = path.basename(entry.name, '.json').replace(/_prefab$/i, '');
		exportMap.set(normalizedBlockLookupKey(stem), stem);
	}
	return exportMap;
}

function escapePowerShellSingleQuoted(value: string) {
	return value.replace(/'/g, "''");
}

const loadVanillaEnumNames = Effect.fnUntraced(function* (
	assemblyPath: string,
	execFile: typeof childProcess.execFile = childProcess.execFile
): Effect.fn.Return<string[], unknown> {
	const command = [
		`$asm = [Reflection.Assembly]::LoadFrom('${escapePowerShellSingleQuoted(assemblyPath)}')`,
		"$t = $asm.GetType('BlockTypes')",
		"if ($null -eq $t) { throw 'BlockTypes enum not found' }",
		'$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::Static',
		'$names = @($t.GetFields($flags) | Where-Object { -not [Attribute]::IsDefined($_, [ObsoleteAttribute]) } | ForEach-Object { $_.Name })',
		'ConvertTo-Json -InputObject $names -Compress'
	].join('; ');

	return yield* Effect.tryPromise({
		try: () =>
			new Promise<string[]>((resolve, reject) => {
				execFile('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 30000 }, (error, stdout) => {
					if (error) {
						reject(error);
						return;
					}

					try {
						const trimmedOutput = stdout.trim();
						if (!trimmedOutput) {
							resolve([]);
							return;
						}
						const parsed = JSON.parse(trimmedOutput);
						resolve(Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]);
					} catch (parseError) {
						reject(parseError);
					}
				});
			}),
		catch: (error) => toEffectOperationError('load vanilla enum names', error)
	});
});

function isDeprecatedVanillaBlockIdentifier(value: string): boolean {
	const identifier = value.trim().replace(/^_/, '');
	return /^deprecated(?:$|[_\s-])/i.test(identifier) || /^Deprecated[A-Z]/.test(identifier) || /^deprecated[A-Z]/.test(identifier);
}

function isReservedVanillaBlockIdentifier(value: string): boolean {
	const identifier = value.trim();
	return /^SPE_Reserved_/i.test(identifier) || /^GSO_ArmourNew3_(?:Left|Right)_226$/i.test(identifier);
}

function shouldSkipVanillaBlockIdentifier(value: string): boolean {
	return isDeprecatedVanillaBlockIdentifier(value) || isReservedVanillaBlockIdentifier(value);
}

export const extractVanillaSourceRecords = Effect.fnUntraced(function* (
	source: BlockLookupSourceRecord,
	options?: BlockLookupRenderedPreviewAcquisitionOptions
): Effect.fn.Return<BlockLookupRecord[]> {
	const enumNames = yield* loadVanillaEnumNames(source.sourcePath).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to index vanilla TerraTech blocks from ${source.sourcePath}`);
			log.warn(error);
			return Effect.succeed(null);
		})
	);
	if (!enumNames) {
		return [];
	}
	const records = yield* Effect.try({
		try: () => {
			const exportMap = buildVanillaExportMap(source.sourcePath);
			return enumNames.flatMap((enumName) => {
				const displaySource = exportMap.get(normalizedBlockLookupKey(enumName)) || enumName;
				if (shouldSkipVanillaBlockIdentifier(enumName) || shouldSkipVanillaBlockIdentifier(displaySource)) {
					return [];
				}
				const block: ExtractedTextBlock = {
					blockName: humanizeBlockLookupIdentifier(displaySource),
					blockId: '',
					internalName: enumName
				};
				return [
					createBlockLookupRecord(source, block, {
						preferredAlias: enumName,
						fallbackAlias: enumName
					})
				];
			});
		},
		catch: (error) => toEffectOperationError(`index vanilla TerraTech blocks from ${source.sourcePath}`, error)
	}).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to index vanilla TerraTech blocks from ${source.sourcePath}`);
			log.warn(error);
			return Effect.succeed<BlockLookupRecord[]>([]);
		})
	);
	if (records.length === 0) {
		return records;
	}
	const previewAssets = yield* loadVanillaRenderedPreviewAssets(source.sourcePath, records, options);
	return assignRenderedBlockPreviewsToRecords(records, previewAssets, options);
});

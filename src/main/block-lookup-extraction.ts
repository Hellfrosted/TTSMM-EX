import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';
import {
	createBlockLookupRecord,
	createBlockLookupRecordsFromTextAssets,
	humanizeBlockLookupIdentifier,
	normalizedBlockLookupKey,
	readBlockLookupSourceTextAsset,
	type BlockLookupTextAsset,
	type ExtractedTextBlock
} from './block-lookup-nuterra-text';

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

function loadVanillaEnumNames(assemblyPath: string, execFile: typeof childProcess.execFile = childProcess.execFile): Promise<string[]> {
	const command = [
		`$asm = [Reflection.Assembly]::LoadFrom('${escapePowerShellSingleQuoted(assemblyPath)}')`,
		"$t = $asm.GetType('BlockTypes')",
		"if ($null -eq $t) { throw 'BlockTypes enum not found' }",
		'[Enum]::GetNames($t) | ConvertTo-Json -Compress'
	].join('; ');

	return new Promise((resolve, reject) => {
		execFile('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 30000 }, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}

			try {
				const parsed = JSON.parse(stdout.trim());
				resolve(Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]);
			} catch (parseError) {
				reject(parseError);
			}
		});
	});
}

export async function extractRecordsFromSource(
	source: BlockLookupSourceRecord,
	extractedBundleTextAssets?: BlockLookupTextAsset[]
): Promise<BlockLookupRecord[]> {
	if (source.sourceKind === 'vanilla') {
		try {
			const exportMap = buildVanillaExportMap(source.sourcePath);
			const enumNames = await loadVanillaEnumNames(source.sourcePath);
			return enumNames.map((enumName) => {
				const displaySource = exportMap.get(normalizedBlockLookupKey(enumName)) || enumName;
				const block: ExtractedTextBlock = {
					blockName: humanizeBlockLookupIdentifier(displaySource),
					blockId: '',
					internalName: enumName
				};
				return createBlockLookupRecord(source, block, {
					preferredAlias: enumName,
					fallbackAlias: enumName
				});
			});
		} catch (error) {
			log.warn(`Failed to index vanilla TerraTech blocks from ${source.sourcePath}`);
			log.warn(error);
			return [];
		}
	}

	if (source.sourceKind === 'bundle' && extractedBundleTextAssets) {
		return createBlockLookupRecordsFromTextAssets(source, extractedBundleTextAssets);
	}

	try {
		return createBlockLookupRecordsFromTextAssets(source, [readBlockLookupSourceTextAsset(source.sourcePath)]);
	} catch (error) {
		log.warn(`Failed to index block source ${source.sourcePath}`);
		log.warn(error);
		return [];
	}
}

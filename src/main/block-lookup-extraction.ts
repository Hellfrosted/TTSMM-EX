import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';

const NAME_RE = /"Name"\s*:\s*"([^"]+)"/i;
const ID_RE = /"ID"\s*:\s*(\d+)/i;
const UNITY_NAME_RE = /"m_Name"\s*:\s*"([^"]+)"/i;
const BUNDLE_SCAN_CONTEXT_CHARS = 8192;
const PYTHON_BUNDLE_EXTRACT_SCRIPT = String.raw`
import json
import re
import sys

NAME_RE = re.compile(r'"Name"\s*:\s*"([^"]+)"')
ID_RE = re.compile(r'"ID"\s*:\s*(\d+)')

try:
    import UnityPy
except ModuleNotFoundError as exc:
    print(json.dumps({"available": False, "error": str(exc), "results": {}}))
    raise SystemExit(0)

def parse_block(text, internal_name):
    name_match = NAME_RE.search(text)
    if not name_match:
        return None
    id_match = ID_RE.search(text)
    return {
        "blockName": name_match.group(1),
        "blockId": id_match.group(1) if id_match else "",
        "internalName": internal_name or name_match.group(1),
    }

payload = json.loads(sys.stdin.read() or "[]")
results = {}
for source_path in payload:
    blocks = []
    seen = set()
    try:
        env = UnityPy.load(source_path)
        for obj in env.objects:
            if obj.type.name != "TextAsset":
                continue
            data = obj.read()
            internal_name = getattr(data, "m_Name", "") or ""
            text = getattr(data, "m_Script", b"")
            if isinstance(text, bytes):
                text = text.decode("utf-8", errors="replace")
            if "NuterraBlock" not in text:
                continue
            parsed = parse_block(text, internal_name)
            if not parsed:
                continue
            key = (parsed["blockName"], parsed["blockId"], parsed["internalName"])
            if key in seen:
                continue
            seen.add(key)
            blocks.append(parsed)
    except Exception:
        blocks = []
    results[source_path] = blocks

print(json.dumps({"available": True, "results": results}))
`;

interface ExtractedTextBlock {
	blockName: string;
	blockId: string;
	internalName: string;
}

interface PythonBundleExtractResult {
	available: boolean;
	results: Record<string, ExtractedTextBlock[]>;
	error?: string;
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

function normalizedLookupKey(value: string): string {
	return value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
}

function humanizeIdentifier(value: string): string {
	return value
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildBlockLookupAliases(blockName: string, modTitle: string): { preferredAlias: string; fallbackAlias: string } {
	return {
		preferredAlias: `${observedNormalize(blockName)}(${observedNormalize(modTitle)})`,
		fallbackAlias: `${strictNormalize(blockName)}(${strictNormalize(modTitle)})`
	};
}

function createBlockLookupRecord(
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
		preferredAlias: aliases.preferredAlias,
		fallbackAlias: aliases.fallbackAlias,
		spawnCommand: `SpawnBlock ${aliases.preferredAlias}`,
		fallbackSpawnCommand: `SpawnBlock ${aliases.fallbackAlias}`
	};
}

function parseNuterraBlockText(text: string, fallbackInternalName: string): ExtractedTextBlock | null {
	const name = NAME_RE.exec(text)?.[1]?.trim();
	if (!name) {
		return null;
	}

	return {
		blockName: name,
		blockId: ID_RE.exec(text)?.[1] || '',
		internalName: UNITY_NAME_RE.exec(text)?.[1]?.trim() || fallbackInternalName
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
			const key = `${normalizedLookupKey(parsed.blockName)}:${parsed.blockId}:${parsed.internalName}`;
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

export function extractBundleBlocksWithPython(
	sourcePaths: string[],
	execFile: typeof childProcess.execFile = childProcess.execFile
): Promise<Map<string, ExtractedTextBlock[]> | null> {
	if (sourcePaths.length === 0) {
		return Promise.resolve(new Map());
	}

	return new Promise((resolve) => {
		const child = execFile(
			'python',
			['-c', PYTHON_BUNDLE_EXTRACT_SCRIPT],
			{
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
				timeout: 180000
			},
			(error, stdout) => {
				if (error) {
					log.warn('Python/UnityPy block bundle extraction is unavailable; falling back to raw bundle text scan.');
					log.warn(error);
					resolve(null);
					return;
				}

				try {
					const parsed = JSON.parse(stdout) as PythonBundleExtractResult;
					if (!parsed.available) {
						log.warn(parsed.error || 'Python/UnityPy block bundle extraction is unavailable; falling back to raw bundle text scan.');
						resolve(null);
						return;
					}

					const results = new Map<string, ExtractedTextBlock[]>();
					Object.entries(parsed.results || {}).forEach(([sourcePath, blocks]) => {
						results.set(sourcePath, Array.isArray(blocks) ? blocks.filter(isExtractedTextBlock) : []);
					});
					resolve(results);
				} catch (parseError) {
					log.warn('Failed to parse Python/UnityPy block bundle extraction results; falling back to raw bundle text scan.');
					log.warn(parseError);
					resolve(null);
				}
			}
		);
		child.stdin?.end(JSON.stringify(sourcePaths));
	});
}

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
		exportMap.set(normalizedLookupKey(stem), stem);
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
	extractedBundleBlocks?: ExtractedTextBlock[]
): Promise<BlockLookupRecord[]> {
	if (source.sourceKind === 'vanilla') {
		try {
			const exportMap = buildVanillaExportMap(source.sourcePath);
			const enumNames = await loadVanillaEnumNames(source.sourcePath);
			return enumNames.map((enumName) => {
				const displaySource = exportMap.get(normalizedLookupKey(enumName)) || enumName;
				const block: ExtractedTextBlock = {
					blockName: humanizeIdentifier(displaySource),
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

	if (source.sourceKind === 'bundle' && extractedBundleBlocks) {
		return extractedBundleBlocks.map((block) => createBlockLookupRecord(source, block));
	}

	try {
		const text = fs.readFileSync(source.sourcePath).toString('utf8');
		const blocks = extractNuterraBlocksFromText(text, path.basename(source.sourcePath, path.extname(source.sourcePath)));
		return blocks.map((block) => createBlockLookupRecord(source, block));
	} catch (error) {
		log.warn(`Failed to index block source ${source.sourcePath}`);
		log.warn(error);
		return [];
	}
}

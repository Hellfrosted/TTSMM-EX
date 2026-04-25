import os from 'node:os';
import path from 'node:path';

export function normalizePathValue(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const trimmedValue = value.trim().replace(/^"+|"+$/g, '').replace(/\\\\/g, '\\');
	if (trimmedValue.length === 0) {
		return null;
	}

	const normalized = path.normalize(trimmedValue);
	return normalized.length > 0 ? normalized : null;
}

export function expandUserPath(value: string | null | undefined, homeDir: string = os.homedir()): string | null {
	const normalized = normalizePathValue(value);
	if (!normalized) {
		return null;
	}

	if (normalized === '~') {
		return homeDir;
	}

	if (/^~[\\/]/.test(normalized)) {
		return path.join(homeDir, normalized.slice(2));
	}

	return normalized;
}

export function parseSteamLibraryFolders(contents: string): string[] {
	return [...contents.matchAll(/"path"\s+"([^"]+)"/g)]
		.map((match) => normalizePathValue(match[1]))
		.filter((libraryPath): libraryPath is string => !!libraryPath);
}

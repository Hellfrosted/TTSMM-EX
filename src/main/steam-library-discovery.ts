import os from 'node:os';
import childProcess from 'child_process';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { normalizePathValue, parseSteamLibraryFolders } from './path-utils';

interface SteamLibraryDiscoveryOptions {
	env?: NodeJS.ProcessEnv;
	execFileSync?: typeof childProcess.execFileSync;
	existsSync?: typeof fs.existsSync;
	homeDir?: string;
	includeWindowsDriveCandidates?: boolean;
	platform?: NodeJS.Platform;
	readFileSync?: typeof fs.readFileSync;
	registrySteamPath?: string | null;
}

function getWindowsSteamPathFromRegistry(execFileSync: typeof childProcess.execFileSync = childProcess.execFileSync): string | null {
	try {
		const output = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
			encoding: 'utf8'
		});
		const match = output.match(/SteamPath\s+REG_\w+\s+(.+)$/m);
		return normalizePathValue(match?.[1]);
	} catch {
		return null;
	}
}

function getCommonSteamLocationCandidates({
	env = process.env,
	execFileSync = childProcess.execFileSync,
	existsSync = fs.existsSync,
	homeDir = os.homedir(),
	includeWindowsDriveCandidates = false,
	platform = process.platform,
	registrySteamPath
}: SteamLibraryDiscoveryOptions = {}) {
	const candidates = new Set<string>();
	const addCandidate = (candidate: string | null | undefined) => {
		const normalized = normalizePathValue(candidate);
		if (normalized) {
			candidates.add(normalized);
		}
	};

	if (platform === 'win32') {
		addCandidate(registrySteamPath === undefined ? getWindowsSteamPathFromRegistry(execFileSync) : registrySteamPath);
		[env['ProgramFiles(x86)'], env['PROGRAMFILES(X86)'], env.ProgramFiles, env.PROGRAMFILES].forEach((basePath) => {
			if (basePath) {
				addCandidate(path.join(basePath, 'Steam'));
			}
		});

		if (includeWindowsDriveCandidates) {
			for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
				const driveRoot = `${letter}:\\`;
				if (!existsSync(driveRoot)) {
					continue;
				}
				addCandidate(path.join(driveRoot, 'Steam'));
				addCandidate(path.join(driveRoot, 'SteamLibrary'));
				addCandidate(path.join(driveRoot, 'Program Files', 'Steam'));
				addCandidate(path.join(driveRoot, 'Program Files (x86)', 'Steam'));
			}
		}
		return [...candidates];
	}

	addCandidate(path.join(homeDir, '.steam', 'steam'));
	addCandidate(path.join(homeDir, '.local', 'share', 'Steam'));
	return [...candidates];
}

export function findSteamLibraryPaths({
	existsSync = fs.existsSync,
	readFileSync = fs.readFileSync,
	...options
}: SteamLibraryDiscoveryOptions = {}): string[] {
	const libraries = new Set<string>();
	const addLibrary = (libraryPath: string | null | undefined) => {
		const normalized = normalizePathValue(libraryPath);
		if (normalized && existsSync(normalized)) {
			libraries.add(normalized);
		}
	};

	getCommonSteamLocationCandidates({ ...options, existsSync }).forEach((steamDir) => {
		addLibrary(steamDir);
		for (const vdfPath of [path.join(steamDir, 'config', 'libraryfolders.vdf'), path.join(steamDir, 'steamapps', 'libraryfolders.vdf')]) {
			if (!existsSync(vdfPath)) {
				continue;
			}
			try {
				parseSteamLibraryFolders(readFileSync(vdfPath, 'utf8')).forEach(addLibrary);
			} catch (error) {
				log.warn(`Failed to read Steam library folders from ${vdfPath}`);
				log.warn(error);
			}
		}
	});

	return [...libraries];
}

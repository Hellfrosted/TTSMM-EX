import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isExecutedDirectly } from './lib/is-main';
import { repoRoot } from './lib/paths';

type DownloadArtifact = (options: {
	readonly artifactName: 'electron';
	readonly arch: string;
	readonly force: boolean;
	readonly platform: NodeJS.Platform | 'mas';
	readonly version: string;
}) => Promise<string>;

interface ElectronBinaryCheckOptions {
	readonly arch?: string;
	readonly electronPackageDir?: string;
	readonly forceDownload?: boolean;
	readonly log?: (message: string) => void;
	readonly platform?: NodeJS.Platform | 'mas';
	readonly repoDir?: string;
	readonly runCommand?: typeof spawnSync;
}

interface ElectronBinaryPaths {
	readonly distDir: string;
	readonly executableName: string;
	readonly executablePath: string;
	readonly packageDir: string;
	readonly pathFile: string;
}

const executableByPlatform: Readonly<Record<string, string>> = {
	darwin: 'Electron.app/Contents/MacOS/Electron',
	freebsd: 'electron',
	linux: 'electron',
	mas: 'Electron.app/Contents/MacOS/Electron',
	openbsd: 'electron',
	win32: 'electron.exe'
};

export function getElectronExecutableName(platform: NodeJS.Platform | 'mas') {
	const executableName = executableByPlatform[platform];
	if (!executableName) {
		throw new Error(`Electron builds are not available on platform: ${platform}`);
	}
	return executableName;
}

export function getElectronBinaryPaths(packageDir: string, platform: NodeJS.Platform | 'mas'): ElectronBinaryPaths {
	const executableName = getElectronExecutableName(platform);
	const distDir = path.join(packageDir, 'dist');
	return {
		distDir,
		executableName,
		executablePath: path.join(distDir, executableName),
		packageDir,
		pathFile: path.join(packageDir, 'path.txt')
	};
}

export function isElectronBinaryReady(paths: ElectronBinaryPaths, existsSync: typeof fs.existsSync = fs.existsSync) {
	return existsSync(paths.pathFile) && existsSync(paths.executablePath);
}

export function createExtractCommand(platform: NodeJS.Platform, zipPath: string, targetDir: string) {
	if (platform === 'win32') {
		return {
			args: ['-NoProfile', '-Command', 'Expand-Archive', '-LiteralPath', zipPath, '-DestinationPath', targetDir, '-Force'],
			command: 'powershell'
		};
	}

	return {
		args: ['-oq', zipPath, '-d', targetDir],
		command: 'unzip'
	};
}

export async function ensureElectronBinary({
	arch = process.arch,
	electronPackageDir,
	forceDownload = false,
	log = console.log,
	platform = process.platform,
	repoDir = repoRoot,
	runCommand = spawnSync
}: ElectronBinaryCheckOptions = {}) {
	const packageDir = electronPackageDir ?? path.dirname(createRequire(path.join(repoDir, 'package.json')).resolve('electron/package.json'));
	const paths = getElectronBinaryPaths(packageDir, platform);
	if (!forceDownload && isElectronBinaryReady(paths)) {
		return 0;
	}

	const electronRequire = createRequire(path.join(packageDir, 'package.json'));
	const electronPackage = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as { readonly version: string };
	const { downloadArtifact } = electronRequire('@electron/get') as { readonly downloadArtifact: DownloadArtifact };

	log(`Installing Electron ${electronPackage.version} for ${platform}-${arch}...`);
	const zipPath = await downloadArtifact({
		artifactName: 'electron',
		arch,
		force: forceDownload,
		platform,
		version: electronPackage.version
	});

	fs.mkdirSync(paths.distDir, { recursive: true });
	const extractCommand = createExtractCommand(process.platform, zipPath, paths.distDir);
	const result = runCommand(extractCommand.command, extractCommand.args, { stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`Electron artifact extraction failed with exit code ${result.status ?? 'unknown'}.`);
	}

	fs.writeFileSync(paths.pathFile, paths.executableName);
	if (!isElectronBinaryReady(paths)) {
		throw new Error(`Electron executable was not found after installation: ${paths.executablePath}`);
	}

	return 0;
}

export async function runEnsureElectronBinaryCli() {
	try {
		return await ensureElectronBinary();
	} catch (error) {
		console.error(error instanceof Error ? error.message : 'Electron binary could not be installed.');
		return 1;
	}
}

if (isExecutedDirectly(import.meta.url)) {
	void runEnsureElectronBinaryCli().then((exitCode) => {
		process.exit(exitCode);
	});
}

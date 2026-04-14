// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setupModulePath = '../../../scripts/steamworks-setup';
const pathsModulePath = '../../../scripts/lib/paths';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');

type MockedPaths = {
	repoRoot: string;
	releaseAppPath: string;
	releaseAppNodeModulesPath: string;
	srcNodeModulesPath: string;
};

function setProcessTarget(platform: NodeJS.Platform, arch: string) {
	Object.defineProperty(process, 'platform', {
		value: platform,
		configurable: true
	});
	Object.defineProperty(process, 'arch', {
		value: arch,
		configurable: true
	});
}

function restoreProcessTarget() {
	if (originalPlatform) {
		Object.defineProperty(process, 'platform', originalPlatform);
	}
	if (originalArch) {
		Object.defineProperty(process, 'arch', originalArch);
	}
}

function createLinuxSdk(sdkPath: string) {
	fs.mkdirSync(path.join(sdkPath, 'public', 'steam', 'lib', 'linux64'), { recursive: true });
	fs.mkdirSync(path.join(sdkPath, 'redistributable_bin', 'linux64'), { recursive: true });
	fs.writeFileSync(path.join(sdkPath, 'public', 'steam', 'steam_api.h'), '// steam api header');
	fs.writeFileSync(path.join(sdkPath, 'public', 'steam', 'lib', 'linux64', 'libsdkencryptedappticket.so'), 'ticket');
	fs.writeFileSync(path.join(sdkPath, 'redistributable_bin', 'linux64', 'libsteam_api.so'), 'steam');
}

function createGreenworksSkeleton(greenworksPath: string, previewTypeSignature: string) {
	fs.mkdirSync(path.join(greenworksPath, 'src'), { recursive: true });
	fs.writeFileSync(path.join(greenworksPath, 'binding.gyp'), "'python',\n");
	fs.writeFileSync(
		path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc'),
		`${previewTypeSignature}\n\treturn nullptr;\n}\n`
	);
}

function createDirectoryLink(targetPath: string, linkPath: string) {
	fs.symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

function createRepoLayout() {
	const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-steamworks-setup-'));
	const releaseAppPath = path.join(repoRoot, 'release', 'app');
	const releaseAppNodeModulesPath = path.join(releaseAppPath, 'node_modules');
	const srcNodeModulesPath = path.join(repoRoot, 'src', 'node_modules');
	const sdkPath = path.join(repoRoot, 'sdk');

	fs.mkdirSync(releaseAppNodeModulesPath, { recursive: true });
	fs.mkdirSync(srcNodeModulesPath, { recursive: true });
	createLinuxSdk(sdkPath);

	return {
		sdkPath,
		paths: {
			repoRoot,
			releaseAppPath,
			releaseAppNodeModulesPath,
			srcNodeModulesPath
		} satisfies MockedPaths
	};
}

async function importSteamworksSetup(paths: MockedPaths, execSync: ReturnType<typeof vi.fn>) {
	vi.resetModules();
	vi.doMock(pathsModulePath, () => paths);
	vi.doMock('node:child_process', () => ({ execSync }));

	return import(setupModulePath);
}

afterEach(() => {
	restoreProcessTarget();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('steamworks setup scripts', () => {
	it('uses the Linux setup path without invoking PowerShell and stages greenworks before rebuild', async () => {
		const { sdkPath, paths } = createRepoLayout();
		const greenworksPath = path.join(paths.releaseAppNodeModulesPath, 'greenworks');
		const stagedSdkPath = path.join(greenworksPath, 'deps', 'steamworks_sdk');
		setProcessTarget('linux', 'x64');

		const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
		const execSync = vi.fn((command: string, options?: { cwd?: string; env?: NodeJS.ProcessEnv; encoding?: string }) => {
			if (command === 'npm --prefix release/app install --ignore-scripts') {
				createGreenworksSkeleton(greenworksPath, 'char *PreviewTypeToString(EItemPreviewType type) {');
				return Buffer.from('');
			}

			if (command === 'ps -ax -o pid= -o command=') {
				return ` 42 electron ${path.join(paths.repoRoot, 'scripts', '.tmp', 'ttsmm-steamworks-smoke-worker.ts').replace(/\\/g, '/')}\n`;
			}

			if (command === 'npm run electron-rebuild') {
				expect(options?.cwd).toBe(paths.releaseAppPath);
				expect(options?.env?.STEAMWORKS_SDK_PATH).toBe(stagedSdkPath);
				return Buffer.from('');
			}

			throw new Error(`Unexpected command: ${command}`);
		});

		const { setupSteamworksNativeDeps } = await importSteamworksSetup(paths, execSync);
		setupSteamworksNativeDeps(sdkPath);

		expect(execSync.mock.calls.map(([command]) => command)).toContain('npm --prefix release/app install --ignore-scripts');
		expect(execSync.mock.calls.map(([command]) => command)).toContain('ps -ax -o pid= -o command=');
		expect(execSync.mock.calls.map(([command]) => command)).toContain('npm run electron-rebuild');
		expect(execSync.mock.calls.some(([command]) => command.includes('powershell'))).toBe(false);
		expect(killSpy).toHaveBeenCalledWith(42, 'SIGKILL');
		expect(fs.readFileSync(path.join(greenworksPath, 'binding.gyp'), 'utf8')).toContain("'python3',");
		expect(fs.readFileSync(path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc'), 'utf8')).toContain(
			'const char *PreviewTypeToString(EItemPreviewType type) {'
		);
		expect(fs.existsSync(path.join(stagedSdkPath, 'redistributable_bin', 'linux64', 'libsteam_api.so'))).toBe(true);
		expect(fs.existsSync(path.join(stagedSdkPath, 'public', 'steam', 'lib', 'linux64', 'libsdkencryptedappticket.so'))).toBe(true);
	});

	it('keeps the workshop worker patch idempotent on repeated Linux setup runs', async () => {
		const { sdkPath, paths } = createRepoLayout();
		const greenworksPath = path.join(paths.releaseAppNodeModulesPath, 'greenworks');
		setProcessTarget('linux', 'x64');

		createGreenworksSkeleton(greenworksPath, 'const char *PreviewTypeToString(EItemPreviewType type) {');

		const execSync = vi.fn((command: string) => {
			if (command === 'ps -ax -o pid= -o command=') {
				return '';
			}

			if (command === 'npm run electron-rebuild') {
				return Buffer.from('');
			}

			throw new Error(`Unexpected command: ${command}`);
		});

		const { setupSteamworksNativeDeps } = await importSteamworksSetup(paths, execSync);
		setupSteamworksNativeDeps(sdkPath);
		setupSteamworksNativeDeps(sdkPath);

		const source = fs.readFileSync(path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc'), 'utf8');
		expect(source).toContain('const char *PreviewTypeToString(EItemPreviewType type) {');
		expect(source).not.toContain('const const char *PreviewTypeToString(EItemPreviewType type) {');
		expect(execSync.mock.calls.some(([command]) => command.includes('install --ignore-scripts'))).toBe(false);
	});

	it('recreates a dangling src node_modules link during setup staging', async () => {
		const { paths } = createRepoLayout();
		const staleModulesPath = path.join(paths.repoRoot, 'stale-release', 'node_modules');

		fs.rmSync(paths.srcNodeModulesPath, { recursive: true, force: true });
		fs.mkdirSync(staleModulesPath, { recursive: true });
		createDirectoryLink(staleModulesPath, paths.srcNodeModulesPath);
		fs.rmSync(path.dirname(staleModulesPath), { recursive: true, force: true });

		const execSync = vi.fn();
		const { linkModules } = await importSteamworksSetup(paths, execSync);

		expect(fs.existsSync(paths.srcNodeModulesPath)).toBe(false);

		linkModules();

		expect(path.normalize(fs.realpathSync.native(paths.srcNodeModulesPath))).toBe(path.normalize(fs.realpathSync.native(paths.releaseAppNodeModulesPath)));
		expect(execSync).not.toHaveBeenCalled();
	});
});

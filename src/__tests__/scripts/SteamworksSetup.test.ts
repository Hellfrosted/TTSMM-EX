// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function createWindowsSdk(sdkPath: string) {
	fs.mkdirSync(path.join(sdkPath, 'public', 'steam', 'lib', 'win64'), { recursive: true });
	fs.mkdirSync(path.join(sdkPath, 'redistributable_bin', 'win64'), { recursive: true });
	fs.writeFileSync(path.join(sdkPath, 'public', 'steam', 'steam_api.h'), '// steam api header');
	fs.writeFileSync(path.join(sdkPath, 'public', 'steam', 'lib', 'win64', 'steam_api64.lib'), 'steam import lib');
	fs.writeFileSync(path.join(sdkPath, 'public', 'steam', 'lib', 'win64', 'sdkencryptedappticket64.lib'), 'ticket import lib');
	fs.writeFileSync(path.join(sdkPath, 'public', 'steam', 'lib', 'win64', 'sdkencryptedappticket64.dll'), 'ticket dll');
	fs.writeFileSync(path.join(sdkPath, 'redistributable_bin', 'win64', 'steam_api64.dll'), 'steam dll');
}

function createGreenworksSkeleton(greenworksPath: string, previewTypeSignature: string) {
	fs.mkdirSync(path.join(greenworksPath, 'src'), { recursive: true });
	fs.writeFileSync(path.join(greenworksPath, 'package.json'), '{"name":"greenworks"}');
	fs.writeFileSync(path.join(greenworksPath, 'greenworks.js'), 'module.exports = {};\n');
	fs.writeFileSync(
		path.join(greenworksPath, 'binding.gyp'),
		[
			"'python',",
			'        [\'OS== "win" and target_arch=="x64"\',',
			'          {',
			"            'defines': [",
			"              '_AMD64_',",
			'            ],',
			'          },',
			'        ],',
			''
		].join('\n')
	);
	fs.writeFileSync(path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc'), `${previewTypeSignature}\n\treturn nullptr;\n}\n`);
}

function createNanSkeletonAt(nanPath: string) {
	fs.mkdirSync(nanPath, { recursive: true });
	fs.writeFileSync(path.join(nanPath, 'package.json'), '{"name":"nan"}');
	fs.writeFileSync(path.join(nanPath, 'nan.h'), '#include <node_version.h>\n\n#include <node.h>\n');
	fs.writeFileSync(
		path.join(nanPath, 'nan_implementation_12_inl.h'),
		[
			'return v8::External::New(v8::Isolate::GetCurrent(), value);',
			'v8::External::New(isolate, reinterpret_cast<void *>(callback));',
			''
		].join('\n')
	);
	fs.writeFileSync(path.join(nanPath, 'nan_callbacks_12_inl.h'), '.As<v8::External>()->Value())\n');
}

function createNanSkeleton(releaseAppNodeModulesPath: string) {
	createNanSkeletonAt(path.join(releaseAppNodeModulesPath, 'nan'));
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

	return import('../../../scripts/steamworks-setup');
}

function createPnpmGreenworksSkeleton(paths: MockedPaths, previewTypeSignature: string) {
	const pnpmPackageModulesPath = path.join(paths.releaseAppNodeModulesPath, '.pnpm', 'greenworks@fixture', 'node_modules');
	const realGreenworksPath = path.join(pnpmPackageModulesPath, 'greenworks');
	const virtualGreenworksPath = path.join(paths.releaseAppNodeModulesPath, 'greenworks');
	fs.rmSync(virtualGreenworksPath, { recursive: true, force: true });
	createGreenworksSkeleton(realGreenworksPath, previewTypeSignature);
	createNanSkeletonAt(path.join(pnpmPackageModulesPath, 'nan'));
	fs.symlinkSync(realGreenworksPath, virtualGreenworksPath, 'dir');
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
			if (command === 'pnpm --dir release/app install --force --ignore-workspace --ignore-scripts') {
				createGreenworksSkeleton(greenworksPath, 'char *PreviewTypeToString(EItemPreviewType type) {');
				createNanSkeleton(paths.releaseAppNodeModulesPath);
				return Buffer.from('');
			}

			if (command === 'ps -ax -o pid= -o command=') {
				return ` 42 electron ${path.join(paths.repoRoot, 'scripts', '.tmp', 'ttsmm-steamworks-smoke-worker.ts').replace(/\\/g, '/')}\n`;
			}

			if (command === 'pnpm run rebuild:electron') {
				expect(options?.cwd).toBe(paths.releaseAppPath);
				expect(options?.env?.STEAMWORKS_SDK_PATH).toBe(stagedSdkPath);
				return Buffer.from('');
			}

			throw new Error(`Unexpected command: ${command}`);
		});

		const { setupSteamworksNativeDeps } = await importSteamworksSetup(paths, execSync);
		setupSteamworksNativeDeps(sdkPath);

		expect(execSync.mock.calls.map(([command]) => command)).toContain(
			'pnpm --dir release/app install --force --ignore-workspace --ignore-scripts'
		);
		expect(execSync.mock.calls.map(([command]) => command)).toContain('ps -ax -o pid= -o command=');
		expect(execSync.mock.calls.map(([command]) => command)).toContain('pnpm run rebuild:electron');
		expect(execSync.mock.calls.some(([command]) => command.includes('powershell'))).toBe(false);
		expect(killSpy).toHaveBeenCalledWith(42, 'SIGKILL');
		expect(fs.readFileSync(path.join(greenworksPath, 'binding.gyp'), 'utf8')).toContain("'python3',");
		expect(fs.readFileSync(path.join(greenworksPath, 'src', 'greenworks_workshop_workers.cc'), 'utf8')).toContain(
			'const char *PreviewTypeToString(EItemPreviewType type) {'
		);
		expect(fs.readFileSync(path.join(paths.releaseAppNodeModulesPath, 'nan', 'nan_implementation_12_inl.h'), 'utf8')).toContain(
			'v8::External::New(v8::Isolate::GetCurrent(), value, v8::kExternalPointerTypeTagDefault)'
		);
		expect(fs.readFileSync(path.join(paths.releaseAppNodeModulesPath, 'nan', 'nan_callbacks_12_inl.h'), 'utf8')).toContain(
			'.As<v8::External>()->Value(v8::kExternalPointerTypeTagDefault))'
		);
		expect(fs.existsSync(path.join(stagedSdkPath, 'redistributable_bin', 'linux64', 'libsteam_api.so'))).toBe(true);
		expect(fs.existsSync(path.join(stagedSdkPath, 'public', 'steam', 'lib', 'linux64', 'libsdkencryptedappticket.so'))).toBe(true);
	});

	it('patches greenworks nan rebuild inputs for Electron 42 headers', async () => {
		const { sdkPath, paths } = createRepoLayout();
		const greenworksPath = path.join(paths.releaseAppNodeModulesPath, 'greenworks');
		setProcessTarget('win32', 'x64');
		fs.rmSync(sdkPath, { recursive: true, force: true });
		createWindowsSdk(sdkPath);
		createGreenworksSkeleton(greenworksPath, 'const char *PreviewTypeToString(EItemPreviewType type) {');
		createNanSkeleton(paths.releaseAppNodeModulesPath);

		const execSync = vi.fn((command: string) => {
			if (command.includes('powershell')) {
				return Buffer.from('');
			}

			if (command === 'pnpm run rebuild:electron') {
				return Buffer.from('');
			}

			throw new Error(`Unexpected command: ${command}`);
		});

		const { setupSteamworksNativeDeps } = await importSteamworksSetup(paths, execSync);
		setupSteamworksNativeDeps(sdkPath);
		setupSteamworksNativeDeps(sdkPath);

		const nanHeader = fs.readFileSync(path.join(paths.releaseAppNodeModulesPath, 'nan', 'nan.h'), 'utf8');
		expect(nanHeader).toContain('# define __builtin_frame_address(level) nullptr');
		expect(nanHeader.match(/__builtin_frame_address/g)).toHaveLength(2);
		expect(fs.readFileSync(path.join(paths.releaseAppNodeModulesPath, 'nan', 'nan_implementation_12_inl.h'), 'utf8')).toContain(
			'v8::External::New(isolate, reinterpret_cast<void *>(callback), v8::kExternalPointerTypeTagDefault)'
		);
	});

	it('resolves nan from the real greenworks package path under pnpm symlink layout', async () => {
		const { sdkPath, paths } = createRepoLayout();
		const greenworksPath = path.join(paths.releaseAppNodeModulesPath, 'greenworks');
		const realNanPath = path.join(paths.releaseAppNodeModulesPath, '.pnpm', 'greenworks@fixture', 'node_modules', 'nan');
		setProcessTarget('linux', 'x64');
		createPnpmGreenworksSkeleton(paths, 'const char *PreviewTypeToString(EItemPreviewType type) {');

		const execSync = vi.fn((command: string) => {
			if (command === 'ps -ax -o pid= -o command=') {
				return '';
			}

			if (command === 'pnpm run rebuild:electron') {
				return Buffer.from('');
			}

			throw new Error(`Unexpected command: ${command}`);
		});

		const { setupSteamworksNativeDeps } = await importSteamworksSetup(paths, execSync);
		setupSteamworksNativeDeps(sdkPath);

		expect(fs.lstatSync(greenworksPath).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(path.join(realNanPath, 'nan_callbacks_12_inl.h'), 'utf8')).toContain(
			'.As<v8::External>()->Value(v8::kExternalPointerTypeTagDefault))'
		);
	});

	it('keeps the workshop worker patch idempotent on repeated Linux setup runs', async () => {
		const { sdkPath, paths } = createRepoLayout();
		const greenworksPath = path.join(paths.releaseAppNodeModulesPath, 'greenworks');
		setProcessTarget('linux', 'x64');

		createGreenworksSkeleton(greenworksPath, 'const char *PreviewTypeToString(EItemPreviewType type) {');
		createNanSkeleton(paths.releaseAppNodeModulesPath);

		const execSync = vi.fn((command: string) => {
			if (command === 'ps -ax -o pid= -o command=') {
				return '';
			}

			if (command === 'pnpm run rebuild:electron') {
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
		expect(execSync.mock.calls.some(([command]) => command.includes('--dir release/app install'))).toBe(false);
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

		expect(path.normalize(fs.realpathSync.native(paths.srcNodeModulesPath))).toBe(
			path.normalize(fs.realpathSync.native(paths.releaseAppNodeModulesPath))
		);
		expect(execSync).not.toHaveBeenCalled();
	});
});

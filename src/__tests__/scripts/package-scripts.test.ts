// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyGreenworksRuntime, requiredGreenworksRuntimeFiles } from '../../../scripts/lib/greenworks-runtime';

interface PackageManifest {
	scripts?: Record<string, string>;
}

function expectPnpmRunReferencesToExist(scripts: Record<string, string>) {
	for (const [scriptName, command] of Object.entries(scripts)) {
		for (const match of command.matchAll(/\bpnpm run ([A-Za-z0-9:_-]+)/g)) {
			const referencedScriptName = match[1];
			expect(scripts[referencedScriptName], `${scriptName} references missing script ${referencedScriptName}`).toBeDefined();
		}
	}
}

function readPackageManifest(...manifestPath: string[]): PackageManifest {
	const resolvedManifestPath =
		manifestPath.length > 0 ? path.join(process.cwd(), ...manifestPath) : path.join(process.cwd(), 'package.json');
	return JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8')) as PackageManifest;
}

describe('package scripts', () => {
	it('runs Vite through repo-owned Electron build and dev scripts', () => {
		const packageJson = readPackageManifest();

		expect(packageJson.scripts?.build).toBe('node --import=tsx ./scripts/vite-build.ts');
		expect(packageJson.scripts?.['build:block-lookup']).toBe('node --import=tsx ./scripts/build-block-lookup-extractor.ts');
		expect(packageJson.scripts?.dev).toContain('./scripts/vite-dev.ts');
		expect(packageJson.scripts?.['dev:stop']).toBe('node --import=tsx ./scripts/stop-dev.ts');
		expect(packageJson.scripts?.format).toBe('biome format . --write');
		expect(packageJson.scripts?.lint).toBe('biome check .');
		expect(packageJson.scripts?.['lint:fix']).toBe('biome check . --write --unsafe');
		expect(packageJson.scripts?.validate).toContain('pnpm run build');
		expect(packageJson.scripts?.validate).toContain('pnpm run check:fallow');
		expect(packageJson.scripts?.['check:fallow']).toContain('pnpm run check:dead-code');
		expect(packageJson.scripts?.['check:fallow']).toContain('pnpm run check:dupes');
		expect(packageJson.scripts?.['check:fallow']).toContain('pnpm run check:health');
		expect(packageJson.scripts?.['check:fallow']).toContain('pnpm run check:audit');
		expect(packageJson.scripts?.validate).toContain('pnpm run test');
		expect(packageJson.scripts?.['smoke:ui']).toBe('pnpm run build && pnpm run smoke:ui:built');
		expect(packageJson.scripts?.['smoke:ui:built']).toBe('node --import=tsx ./scripts/smoke-ui.ts');
		expect(packageJson.scripts?.['smoke:ui:packaged']).toBe('pnpm run package && pnpm run smoke:ui:built -- --packaged');
		expect(packageJson.scripts?.['check:staged']).toBe('nano-staged');
		expect(packageJson.scripts?.['lint-staged']).toBeUndefined();
		expect(packageJson.scripts?.prepare).toBe('husky');
		expect(packageJson.scripts?.['start:desktop']).toBeUndefined();
		expect(packageJson.scripts?.['build:native:block-lookup']).toBeUndefined();
		expect(packageJson.scripts?.['lint:biome']).toBeUndefined();
		expect(packageJson.scripts?.fallow).toBeUndefined();
		expect(packageJson.scripts?.deadcode).toBeUndefined();
		expect(packageJson.scripts?.['verify:push']).toBeUndefined();
		expectPnpmRunReferencesToExist(packageJson.scripts ?? {});
	});

	it('uses the same colon naming in the release app helper scripts', () => {
		const packageJson = readPackageManifest('release', 'app', 'package.json');

		expect(packageJson.scripts?.['rebuild:electron']).toBe('node --import=tsx ../../scripts/electron-rebuild.ts');
		expect(packageJson.scripts?.['link:modules']).toBe('node --import=tsx ../../scripts/link-modules.ts');
		expect(packageJson.scripts?.postinstall).toBe('pnpm run rebuild:electron && pnpm run link:modules');
		expect(packageJson.scripts?.['electron-rebuild']).toBeUndefined();
		expect(packageJson.scripts?.['link-modules']).toBeUndefined();
		expectPnpmRunReferencesToExist(packageJson.scripts ?? {});
	});

	it('lists only source-owned package scripts in help output', () => {
		const output = execFileSync(process.execPath, ['--import=tsx', './scripts/help.ts'], {
			cwd: process.cwd(),
			encoding: 'utf8'
		});

		expect(output).toContain('package.json (terratech-steam-mod-manager-ex)');
		expect(output).toContain('release/app/package.json (terratech-steam-mod-manager-ex)');
		expect(output).not.toContain('release/package-app/package.json');
		expect(output).not.toContain('release/build/');
	});

	it('copies the required Greenworks runtime files into a sanitized package directory', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-greenworks-runtime-'));
		try {
			const sourcePath = path.join(tempDir, 'source');
			const targetPath = path.join(tempDir, 'target');
			fs.mkdirSync(sourcePath, { recursive: true });
			fs.writeFileSync(
				path.join(sourcePath, 'package.json'),
				`${JSON.stringify(
					{
						name: 'greenworks',
						version: '1.0.0',
						dependencies: { nan: '1.0.0' },
						devDependencies: { typescript: '1.0.0' },
						gypfile: true,
						scripts: { install: 'node-gyp rebuild' }
					},
					null,
					2
				)}\n`
			);
			for (const runtimeFile of requiredGreenworksRuntimeFiles) {
				const runtimePath = path.join(sourcePath, runtimeFile);
				fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
				fs.writeFileSync(runtimePath, runtimeFile);
			}

			copyGreenworksRuntime(sourcePath, targetPath);

			for (const runtimeFile of requiredGreenworksRuntimeFiles) {
				expect(fs.readFileSync(path.join(targetPath, runtimeFile), 'utf8')).toBe(runtimeFile);
			}
			expect(JSON.parse(fs.readFileSync(path.join(targetPath, 'package.json'), 'utf8'))).toEqual({
				name: 'greenworks',
				version: '1.0.0'
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

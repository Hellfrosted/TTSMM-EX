// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

function readPackageManifest(): PackageManifest {
	return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as PackageManifest;
}

describe('package scripts', () => {
	it('runs Vite through repo-owned Electron build and dev scripts', () => {
		const packageJson = readPackageManifest();

		expect(packageJson.devDependencies).not.toHaveProperty('electron-vite');
		expect(packageJson.scripts?.build).toBe('node --import=tsx ./scripts/vite-build.ts');
		expect(packageJson.scripts?.dev).toContain('./scripts/vite-dev.ts');
		expect(packageJson.scripts?.start).toBeUndefined();
		expect(packageJson.scripts?.validate).toContain('pnpm run build');
		expect(packageJson.scripts?.['smoke:ui']).toBe('pnpm run build && pnpm run smoke:ui:built');
		expect(packageJson.scripts?.['smoke:ui:built']).toBe('node --import=tsx ./scripts/smoke-ui.ts');
		expect(packageJson.scripts?.['smoke:ui:packaged']).toBe('pnpm run package && pnpm run smoke:ui:built -- --packaged');
		expect(packageJson.scripts?.prepare).toBe('husky');
	});
});

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { releaseAppPath, repoRoot } from './lib/paths';

const releaseAppPackagePath = path.join(releaseAppPath, 'package.json');
const rootPackagePath = path.join(repoRoot, 'package.json');
const installedElectronPackagePath = path.join(repoRoot, 'node_modules', 'electron', 'package.json');
const releaseAppPackage = JSON.parse(fs.readFileSync(releaseAppPackagePath, 'utf8')) as {
	dependencies?: Record<string, string>;
};
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8')) as {
	devDependencies?: Record<string, string>;
};
const electronVersion = fs.existsSync(installedElectronPackagePath)
	? (JSON.parse(fs.readFileSync(installedElectronPackagePath, 'utf8')) as { version: string }).version
	: (rootPackage.devDependencies?.electron || '').replace(/^[^\d]*/, '');

if (Object.keys(releaseAppPackage.dependencies || {}).length > 0 && fs.existsSync(path.join(releaseAppPath, 'node_modules'))) {
	const electronRebuildCmd = `../../node_modules/.bin/electron-rebuild --force --types prod,dev,optional --version ${electronVersion} --module-dir .`;
	const command = process.platform === 'win32' ? electronRebuildCmd.replace(/\//g, '\\') : electronRebuildCmd;
	execSync(command, {
		cwd: releaseAppPath,
		stdio: 'inherit'
	});
}

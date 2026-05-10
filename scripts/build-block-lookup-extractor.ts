import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { releaseAppPath, repoRoot } from './lib/paths';
import { terminalStyle } from './lib/terminal-style';

const manifestPath = path.join(repoRoot, 'native', 'block-lookup-extractor', 'Cargo.toml');
const executableName = process.platform === 'win32' ? 'block-lookup-extractor.exe' : 'block-lookup-extractor';
const cargoTargetDir = process.env.CARGO_TARGET_DIR
	? path.resolve(repoRoot, process.env.CARGO_TARGET_DIR)
	: path.join(repoRoot, 'native', 'block-lookup-extractor', 'target');
const builtExecutablePath = path.join(cargoTargetDir, 'release', executableName);
const releaseBinPath = path.join(releaseAppPath, 'bin');
const releaseExecutablePath = path.join(releaseBinPath, executableName);

console.log(terminalStyle.cyan('Building Block Lookup native extractor.'));
execFileSync('cargo', ['build', '--manifest-path', manifestPath, '--release'], {
	cwd: repoRoot,
	stdio: 'inherit'
});

if (!fs.existsSync(builtExecutablePath)) {
	throw new Error(`Block Lookup extractor build did not produce ${builtExecutablePath}`);
}

fs.mkdirSync(releaseBinPath, { recursive: true });
fs.copyFileSync(builtExecutablePath, releaseExecutablePath);
fs.chmodSync(releaseExecutablePath, 0o755);
console.log(terminalStyle.success(`Block Lookup native extractor staged at ${path.relative(repoRoot, releaseExecutablePath)}.`));

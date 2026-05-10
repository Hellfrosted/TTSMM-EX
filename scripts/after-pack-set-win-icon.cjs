/* global require, module */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveRceditPath(projectDir) {
	const directPath = path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
	if (fs.existsSync(directPath)) {
		return directPath;
	}

	const pnpmStorePath = path.join(projectDir, 'node_modules', '.pnpm');
	if (!fs.existsSync(pnpmStorePath)) {
		return directPath;
	}

	const pnpmEntry = fs
		.readdirSync(pnpmStorePath)
		.find((entry) => entry === 'electron-winstaller' || entry.startsWith('electron-winstaller@'));
	if (!pnpmEntry) {
		return directPath;
	}

	return path.join(pnpmStorePath, pnpmEntry, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
}

module.exports = async function afterPack(context) {
	if (context.electronPlatformName !== 'win32') {
		return;
	}

	const projectDir = context.packager.projectDir;
	const iconPath = path.join(projectDir, 'assets', 'icon.ico');
	const rceditPath = resolveRceditPath(projectDir);
	const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);

	if (!fs.existsSync(iconPath)) {
		throw new Error(`Windows icon not found at ${iconPath}`);
	}

	if (!fs.existsSync(rceditPath)) {
		throw new Error(`rcedit.exe not found at ${rceditPath}`);
	}

	if (!fs.existsSync(exePath)) {
		throw new Error(`Packaged executable not found at ${exePath}`);
	}

	execFileSync(rceditPath, [exePath, '--set-icon', iconPath], {
		stdio: 'inherit'
	});
};

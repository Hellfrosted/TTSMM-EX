/* global require, module */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
	if (context.electronPlatformName !== 'win32') {
		return;
	}

	const projectDir = context.packager.projectDir;
	const iconPath = path.join(projectDir, 'assets', 'icon.ico');
	const rceditPath = path.join(projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
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

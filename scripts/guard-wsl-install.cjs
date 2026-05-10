const fs = require('node:fs');
const os = require('node:os');

const overrideEnvironmentVariable = 'TTSMM_ALLOW_WSL_PNPM_INSTALL';

const isWsl = () => {
	if (process.platform !== 'linux') {
		return false;
	}

	const release = os.release().toLowerCase();
	if (release.includes('microsoft') || release.includes('wsl')) {
		return true;
	}

	try {
		return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
	} catch {
		return false;
	}
};

const isWindowsMountedCheckout = /^\/mnt\/[a-z]\//i.test(process.cwd().replace(/\\/g, '/'));

if (isWsl() && isWindowsMountedCheckout && process.env[overrideEnvironmentVariable] !== '1') {
	console.error(`
Linux pnpm install is disabled in this shared Windows checkout.

Windows owns node_modules for this Electron app. Running Linux pnpm install here
will replace the dependency tree that Windows dev/build/desktop/package commands
need.

From WSL, run Windows pnpm through:
  ./scripts/wsl-pnpm install
  ./scripts/wsl-pnpm run typecheck
  ./scripts/wsl-pnpm test

For intentional recovery work only, rerun with:
  ${overrideEnvironmentVariable}=1 pnpm install
`);
	process.exit(1);
}

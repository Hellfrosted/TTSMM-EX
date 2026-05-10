import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/paths';

type PackageJson = {
	name?: string;
	scripts?: Record<string, string>;
};

type PackageScripts = {
	relativeManifestPath: string;
	relativeDir: string;
	packageName: string;
	scripts: Record<string, string>;
};

const sourceOwnedManifestPaths = ['package.json', 'release/app/package.json'].map((manifestPath) => path.join(repoRoot, manifestPath));

const readPackageScripts = (manifestPath: string): PackageScripts | null => {
	const rawPackageJson = fs.readFileSync(manifestPath, 'utf8');
	const packageJson = JSON.parse(rawPackageJson) as PackageJson;
	const { scripts } = packageJson;

	if (!scripts || Object.keys(scripts).length === 0) {
		return null;
	}

	const relativeManifestPath = (path.relative(repoRoot, manifestPath) || 'package.json').replace(/\\/g, '/');
	const relativeDir = path.dirname(relativeManifestPath);

	return {
		relativeManifestPath,
		relativeDir,
		packageName: packageJson.name ?? relativeManifestPath,
		scripts
	};
};

const formatRunCommand = (packageScripts: PackageScripts, scriptName: string) => {
	if (packageScripts.relativeDir === '.') {
		return `pnpm run ${scriptName}`;
	}

	return `pnpm --dir ${packageScripts.relativeDir.replace(/\\/g, '/')} run ${scriptName}`;
};

const packageScriptSets = sourceOwnedManifestPaths
	.filter((manifestPath) => fs.existsSync(manifestPath))
	.map(readPackageScripts)
	.filter((packageScripts): packageScripts is PackageScripts => packageScripts !== null)
	.sort((left, right) => left.relativeManifestPath.localeCompare(right.relativeManifestPath));

console.log('Available pnpm scripts:\n');

for (const [index, packageScripts] of packageScriptSets.entries()) {
	console.log(`${packageScripts.relativeManifestPath} (${packageScripts.packageName})`);

	for (const [scriptName, command] of Object.entries(packageScripts.scripts)) {
		console.log(`  ${formatRunCommand(packageScripts, scriptName)}`);
		console.log(`    ${command}`);
	}

	if (index < packageScriptSets.length - 1) {
		console.log('');
	}
}

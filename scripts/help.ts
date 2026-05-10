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

const ignoredDirectories = new Set(['.git', 'node_modules']);
const ignoredRelativeDirectories = new Set(['release/build', 'release/package-app']);

const collectPackageJsonPaths = (directoryPath: string): string[] => {
	const packageJsonPaths: string[] = [];
	const directoryEntries = fs.readdirSync(directoryPath, { withFileTypes: true });

	for (const entry of directoryEntries) {
		if (entry.isDirectory()) {
			const entryPath = path.join(directoryPath, entry.name);
			const relativeEntryPath = path.relative(repoRoot, entryPath).replace(/\\/g, '/');

			if (ignoredDirectories.has(entry.name) || ignoredRelativeDirectories.has(relativeEntryPath)) {
				continue;
			}

			packageJsonPaths.push(...collectPackageJsonPaths(entryPath));
			continue;
		}

		if (entry.isFile() && entry.name === 'package.json') {
			packageJsonPaths.push(path.join(directoryPath, entry.name));
		}
	}

	return packageJsonPaths;
};

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

const packageScriptSets = collectPackageJsonPaths(repoRoot)
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

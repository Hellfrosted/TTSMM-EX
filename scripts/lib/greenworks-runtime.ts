import fs from 'node:fs';
import path from 'node:path';

export const requiredGreenworksRuntimeFiles = [
	'greenworks.js',
	path.join('lib', 'greenworks-win64.node'),
	path.join('lib', 'steam_api64.dll'),
	path.join('lib', 'sdkencryptedappticket64.dll')
];

const removeIfExists = (targetPath: string) => {
	fs.rmSync(targetPath, { force: true, recursive: true });
};

const copyFile = (sourcePath: string, targetPath: string) => {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.copyFileSync(sourcePath, targetPath);
};

export const copyGreenworksRuntime = (sourcePath: string, targetPath: string) => {
	const missingRuntimeFiles = requiredGreenworksRuntimeFiles.filter((runtimeFile) => !fs.existsSync(path.join(sourcePath, runtimeFile)));
	if (missingRuntimeFiles.length > 0) {
		throw new Error(
			[
				'Greenworks runtime files are missing from release/app.',
				'Run "pnpm run setup:steamworks" after configuring STEAMWORKS_SDK_PATH or .steamworks-sdk-path, then run packaging again.',
				...missingRuntimeFiles.map((runtimeFile) => `- ${path.join('node_modules', 'greenworks', runtimeFile)}`)
			].join('\n')
		);
	}

	removeIfExists(targetPath);
	const packageJson = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8')) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		gypfile?: boolean;
		scripts?: Record<string, string>;
	};
	delete packageJson.dependencies;
	delete packageJson.devDependencies;
	delete packageJson.gypfile;
	delete packageJson.scripts;
	fs.mkdirSync(targetPath, { recursive: true });
	fs.writeFileSync(path.join(targetPath, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
	for (const runtimeFile of requiredGreenworksRuntimeFiles) {
		copyFile(path.join(sourcePath, runtimeFile), path.join(targetPath, runtimeFile));
	}
};

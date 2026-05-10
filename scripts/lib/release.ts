import fs from 'node:fs';
import { releaseAppDistPath, releaseBuildPath } from './paths';

export const cleanReleaseArtifacts = () => {
	[releaseAppDistPath, releaseBuildPath].forEach((targetPath) => {
		fs.rmSync(targetPath, { force: true, recursive: true });
	});
};

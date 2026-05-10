import { sync as rimrafSync } from 'rimraf';
import { releaseAppDistPath, releaseBuildPath } from './paths';

export const cleanReleaseArtifacts = () => {
	[releaseAppDistPath, releaseBuildPath].forEach((targetPath) => {
		rimrafSync(targetPath);
	});
};

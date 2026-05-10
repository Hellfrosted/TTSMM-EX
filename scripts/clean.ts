import { sync as rimrafSync } from 'rimraf';
import { releaseAppDistPath, releaseBuildPath } from './lib/paths';

[releaseAppDistPath, releaseBuildPath].forEach((targetPath) => {
	rimrafSync(targetPath);
});

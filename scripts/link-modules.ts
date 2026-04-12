import fs from 'node:fs';
import { releaseAppNodeModulesPath, srcNodeModulesPath } from './lib/paths';

if (!fs.existsSync(srcNodeModulesPath) && fs.existsSync(releaseAppNodeModulesPath)) {
	fs.symlinkSync(releaseAppNodeModulesPath, srcNodeModulesPath, 'junction');
}

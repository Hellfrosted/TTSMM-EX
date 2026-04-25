import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '../..');
const releasePath = path.join(repoRoot, 'release');
export const releaseAppPath = path.join(releasePath, 'app');
export const releaseBuildPath = path.join(releasePath, 'build');
export const releaseAppDistPath = path.join(releaseAppPath, 'dist');
export const releaseAppNodeModulesPath = path.join(releaseAppPath, 'node_modules');
export const srcNodeModulesPath = path.join(repoRoot, 'src', 'node_modules');

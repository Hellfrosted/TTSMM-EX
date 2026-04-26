import { build } from 'vite';
import { createMainConfig, createPreloadConfig, createRendererConfig } from '../vite.config';

async function main() {
	await build(createMainConfig());
	await build(createPreloadConfig());
	await build(createRendererConfig(false));
}

void main();

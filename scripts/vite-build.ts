import { build } from 'vite';
import { createMainConfig, createPreloadConfig, createRendererConfig } from '../vite.config';

async function main() {
	await Promise.all([build(createMainConfig()), build(createPreloadConfig()), build(createRendererConfig(false))]);
}

void main();

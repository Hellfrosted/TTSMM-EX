import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolveHtmlPath(htmlFileName: string) {
	if (process.env.ELECTRON_RENDERER_URL) {
		if (!URL.canParse(process.env.ELECTRON_RENDERER_URL)) {
			throw new Error('ELECTRON_RENDERER_URL must be an absolute URL.');
		}
		const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
		rendererUrl.pathname = htmlFileName;
		return rendererUrl.toString();
	}

	return pathToFileURL(path.resolve(__dirname, '../renderer/', htmlFileName)).toString();
}

export function resolvePreloadPath() {
	return path.resolve(__dirname, '../preload/preload.js');
}

import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPreviewAllowlist, registerPreviewImage, resolvePreviewImageRequest } from '../../main/preview-protocol';
import { createTempDir } from './test-utils';

describe('preview protocol', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('ttsmm-preview-test-');
		clearPreviewAllowlist();
	});

	afterEach(() => {
		clearPreviewAllowlist();
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('allowlists preview images from the current scan only', () => {
		const previewPath = path.join(tempDir, 'KnownMod', 'preview.png');
		fs.mkdirSync(path.dirname(previewPath), { recursive: true });
		fs.writeFileSync(previewPath, 'preview');

		const previewUrl = registerPreviewImage(previewPath);

		expect(resolvePreviewImageRequest(previewUrl)).toBe(path.resolve(previewPath));
		expect(resolvePreviewImageRequest('image://preview/not-registered')).toBeNull();
		expect(resolvePreviewImageRequest(`image://preview/${encodeURIComponent(previewPath)}`)).toBeNull();
	});

	it('keeps the previous preview allowlist alive for one refresh cycle', () => {
		const previewPath = path.join(tempDir, 'KnownMod', 'preview.png');
		const refreshedPreviewPath = path.join(tempDir, 'RefreshedMod', 'preview.png');
		fs.mkdirSync(path.dirname(previewPath), { recursive: true });
		fs.mkdirSync(path.dirname(refreshedPreviewPath), { recursive: true });
		fs.writeFileSync(previewPath, 'preview');
		fs.writeFileSync(refreshedPreviewPath, 'preview');

		const previewUrl = registerPreviewImage(previewPath);
		clearPreviewAllowlist();
		const refreshedPreviewUrl = registerPreviewImage(refreshedPreviewPath);

		expect(resolvePreviewImageRequest(previewUrl)).toBe(path.resolve(previewPath));
		expect(resolvePreviewImageRequest(refreshedPreviewUrl)).toBe(path.resolve(refreshedPreviewPath));

		clearPreviewAllowlist();
		expect(resolvePreviewImageRequest(previewUrl)).toBeNull();
	});
});

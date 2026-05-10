import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPreviewAllowlist, registerPreviewImage, registerPreviewProtocol, resolvePreviewImageRequest } from '../../main/preview-protocol';
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

	it('allowlists Steam Workshop preview images named after a bundle', () => {
		const previewPath = path.join(tempDir, 'KnownMod', 'KnownMod_bundle preview.png');
		fs.mkdirSync(path.dirname(previewPath), { recursive: true });
		fs.writeFileSync(previewPath, 'preview');

		const previewUrl = registerPreviewImage(previewPath);

		expect(resolvePreviewImageRequest(previewUrl)).toBe(path.resolve(previewPath));
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

	it('rejects preview registrations whose real path escapes the mod directory', () => {
		const previewPath = path.join(tempDir, 'KnownMod', 'preview.png');
		const escapedPreviewPath = path.join(tempDir, 'OtherMod', 'preview.png');
		fs.mkdirSync(path.dirname(previewPath), { recursive: true });
		fs.writeFileSync(previewPath, 'preview');

		const realpathSpy = vi.spyOn(fs, 'realpathSync').mockReturnValue(escapedPreviewPath);

		expect(registerPreviewImage(previewPath)).toBeUndefined();

		realpathSpy.mockRestore();
	});

	it('returns Electron not-found responses for unregistered preview requests', () => {
		const protocol = {
			registerFileProtocol: vi.fn()
		};
		registerPreviewProtocol(protocol as unknown as Parameters<typeof registerPreviewProtocol>[0]);
		const handler = protocol.registerFileProtocol.mock.calls[0]?.[1];
		const callback = vi.fn();

		handler({ url: 'image://preview/not-registered' }, callback);

		expect(callback).toHaveBeenCalledWith({ error: -6 });
	});
});

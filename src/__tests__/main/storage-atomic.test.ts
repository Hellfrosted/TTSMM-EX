import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';
import { writeUtf8FileAtomicEffect } from '../../main/storage';

it('replaces an existing file without first removing its pathname', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-atomic-'));
	const file = path.join(directory, 'config.json');
	fs.writeFileSync(file, 'old');
	const rename = fs.renameSync;
	const spy = vi.spyOn(fs, 'renameSync').mockImplementation(((source, destination) => {
		expect(fs.readFileSync(file, 'utf8')).toBe('old');
		return rename(source, destination);
	}) as typeof fs.renameSync);
	try {
		Effect.runSync(writeUtf8FileAtomicEffect(file, 'new'));
		expect(fs.readFileSync(file, 'utf8')).toBe('new');
	} finally {
		spy.mockRestore();
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

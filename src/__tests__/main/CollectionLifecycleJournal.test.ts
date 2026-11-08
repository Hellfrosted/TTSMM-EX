import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginCollectionLifecycleJournal, recoverCollectionLifecycleJournal } from '../../main/collection-lifecycle-journal';
import { runConfigTransaction } from '../../main/config-transaction';

describe('collection lifecycle journal', () => {
	let root: string;
	let directory: string;
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'collection-journal-'));
		directory = path.join(root, 'collections');
		fs.mkdirSync(directory);
		fs.writeFileSync(path.join(root, 'config.json'), '{"activeCollection":"old"}');
		fs.writeFileSync(path.join(directory, 'old.json'), '{"mods":["original"]}');
	});
	afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

	it('rolls back an interrupted rename before the next config transaction', async () => {
		beginCollectionLifecycleJournal(root, ['old', 'new', 'default']);
		fs.writeFileSync(path.join(directory, 'new.json'), '{"mods":["draft"]}');
		fs.unlinkSync(path.join(directory, 'old.json'));
		fs.writeFileSync(path.join(root, 'config.json'), '{"activeCollection":"new"}');
		await runConfigTransaction(root, async () => {
			expect(fs.readFileSync(path.join(directory, 'old.json'), 'utf8')).toBe('{"mods":["original"]}');
			expect(fs.existsSync(path.join(directory, 'new.json'))).toBe(false);
			expect(fs.readFileSync(path.join(root, 'config.json'), 'utf8')).toBe('{"activeCollection":"old"}');
		});
		expect(fs.existsSync(path.join(root, 'collection-lifecycle-journal.json'))).toBe(false);
	});

	it('preserves the journal and refuses writes when its contents are invalid', async () => {
		const journal = path.join(root, 'collection-lifecycle-journal.json');
		fs.writeFileSync(journal, JSON.stringify({ version: 1, names: ['old'], files: { '../outside.json': 'bad' }, config: null }));
		const operation = vi.fn(async () => undefined);
		await expect(runConfigTransaction(root, operation)).rejects.toThrow('Invalid collection lifecycle journal');
		expect(operation).not.toHaveBeenCalled();
		expect(fs.existsSync(journal)).toBe(true);
	});

	it('can recover again after an interrupted recovery', () => {
		beginCollectionLifecycleJournal(root, ['old', 'default']);
		fs.unlinkSync(path.join(directory, 'old.json'));
		fs.writeFileSync(path.join(directory, 'default.json'), '{"mods":[]}');
		const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
			throw new Error('disk failure');
		});
		expect(() => recoverCollectionLifecycleJournal(root)).toThrow();
		rename.mockRestore();
		recoverCollectionLifecycleJournal(root);
		expect(fs.readFileSync(path.join(directory, 'old.json'), 'utf8')).toBe('{"mods":["original"]}');
		expect(fs.existsSync(path.join(directory, 'default.json'))).toBe(false);
	});
});

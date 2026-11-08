import { Effect } from 'effect';
import fs from 'fs';
import path from 'path';
import { isValidCollectionName } from '../shared/collection-name';
import { writeUtf8FileAtomicEffect } from './storage';

interface Journal {
	version: 1;
	names: string[];
	files: Record<string, string>;
	config: string | null;
}

const journalPath = (root: string) => path.join(root, 'collection-lifecycle-journal.json');
const collectionsPath = (root: string) => path.join(root, 'collections');
const key = (name: string) => name.toLowerCase();

function matchingFiles(root: string, names: string[]): string[] {
	const directory = collectionsPath(root);
	if (!fs.existsSync(directory)) return [];
	const keys = new Set(names.map(key));
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const parsed = path.parse(entry.name);
		return entry.isFile() && parsed.ext.toLowerCase() === '.json' && keys.has(key(parsed.name)) ? [entry.name] : [];
	});
}

function atomicWrite(filepath: string, contents: string): void {
	Effect.runSync(writeUtf8FileAtomicEffect(filepath, contents));
}

export function beginCollectionLifecycleJournal(root: string, names: string[]): void {
	const unique = [...new Set(names.filter((name) => isValidCollectionName(name)))];
	const files = Object.fromEntries(
		matchingFiles(root, unique).map((name) => [name, fs.readFileSync(path.join(collectionsPath(root), name), 'utf8')])
	);
	const configPath = path.join(root, 'config.json');
	const journal: Journal = {
		version: 1,
		names: unique,
		files,
		config: fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null
	};
	atomicWrite(journalPath(root), JSON.stringify(journal));
}

export function clearCollectionLifecycleJournal(root: string): void {
	fs.rmSync(journalPath(root), { force: true });
}

export function recoverCollectionLifecycleJournal(root: string): void {
	const filepath = journalPath(root);
	if (!fs.existsSync(filepath)) return;
	const journal: unknown = JSON.parse(fs.readFileSync(filepath, 'utf8'));
	if (!journal || typeof journal !== 'object') throw new Error('Invalid collection lifecycle journal');
	const record = journal as Journal;
	if (
		record.version !== 1 ||
		!Array.isArray(record.names) ||
		!record.names.every((name) => typeof name === 'string' && isValidCollectionName(name)) ||
		!record.files ||
		typeof record.files !== 'object' ||
		Array.isArray(record.files) ||
		!(record.config === null || typeof record.config === 'string')
	)
		throw new Error('Invalid collection lifecycle journal');
	const names = new Set(record.names.map(key));
	for (const [name, contents] of Object.entries(record.files)) {
		const parsed = path.parse(name);
		if (
			path.basename(name) !== name ||
			parsed.ext.toLowerCase() !== '.json' ||
			!names.has(key(parsed.name)) ||
			typeof contents !== 'string'
		) {
			throw new Error('Invalid collection lifecycle journal file');
		}
	}
	for (const name of matchingFiles(root, record.names)) {
		if (!Object.hasOwn(record.files, name)) fs.unlinkSync(path.join(collectionsPath(root), name));
	}
	for (const [name, contents] of Object.entries(record.files)) atomicWrite(path.join(collectionsPath(root), name), contents);
	const configPath = path.join(root, 'config.json');
	if (record.config === null) fs.rmSync(configPath, { force: true });
	else atomicWrite(configPath, record.config);
	clearCollectionLifecycleJournal(root);
}

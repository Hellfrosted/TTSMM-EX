// @vitest-environment node

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isExecutedDirectly } from '../../../scripts/lib/is-main';

describe('is-main script helper', () => {
	it('does not treat missing argv script path as direct execution', () => {
		expect(isExecutedDirectly(import.meta.url, undefined)).toBe(false);
	});

	it('matches direct execution by file URL', () => {
		const scriptPath = path.join(process.cwd(), 'scripts', 'check-port-in-use.ts');

		expect(isExecutedDirectly(pathToFileURL(scriptPath).href, scriptPath)).toBe(true);
	});

	it('preserves stop-dev path comparator equivalence', () => {
		const scriptPath = path.join(process.cwd(), 'scripts', 'stop-dev.ts');

		expect(isExecutedDirectly(pathToFileURL(scriptPath).href, path.relative(process.cwd(), scriptPath))).toBe(true);
	});
});

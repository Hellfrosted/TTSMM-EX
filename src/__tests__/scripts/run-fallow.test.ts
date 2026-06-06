// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { shouldSuppressFallowStderrLine } from '../../../scripts/run-fallow';

describe('run-fallow', () => {
	it('suppresses the known packaged-app entry-point warning', () => {
		expect(
			shouldSuppressFallowStderrLine(
				'   1.719567563s  WARN Skipped 5 package.json entry points outside project root or containing parent directory traversal: ../../scripts/electron-rebuild.ts (2x), ../../scripts/link-modules.ts (2x), ./dist/main/main.js'
			)
		).toBe(true);
	});

	it('keeps unrelated warnings visible', () => {
		expect(shouldSuppressFallowStderrLine('[WARN] 5 deprecated subdependencies found: boolean@3.2.0')).toBe(false);
		expect(shouldSuppressFallowStderrLine('Error: something else failed')).toBe(false);
	});
});

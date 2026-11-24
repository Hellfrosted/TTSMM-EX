// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { applyVcsCommandPolicy, HOOK_BYPASS_REASON, NONINTERACTIVE_VCS_ENV } from '../../../scripts/vcs-command-policy';

describe('applyVcsCommandPolicy', () => {
	it.each([
		'git commit -m "fix thing"',
		'git commit -am "fix thing"',
		'git status --short',
		'git diff --stat',
		'git add src/index.ts',
		'git config --get core.hooksPath',
		'cat .husky/pre-commit',
		'pnpm run validate'
	])('allows %s', (command) => {
		expect(applyVcsCommandPolicy(command)).toMatchObject({ action: 'allow' });
	});

	it.each([
		'git commit --no-verify -m "fix thing"',
		'git commit -n -m "fix thing"',
		'git commit -an -m "fix thing"',
		'git commit --no-ver -m "fix thing"',
		'git -c core.hooksPath=/dev/null commit -m "fix thing"',
		'git config core.hooksPath /dev/null',
		'HUSKY=0 git commit -m "fix thing"',
		'export HUSKY=0; git commit -m "fix thing"',
		'LEFTHOOK=0 git commit -m "fix thing"',
		'rm -f .git/hooks/pre-commit',
		'echo nope > .husky/pre-commit',
		'sh -c "git commit --no-verify -m fix"'
	])('blocks %s', (command) => {
		expect(applyVcsCommandPolicy(command)).toEqual({ action: 'block', reason: HOOK_BYPASS_REASON });
	});

	it('makes an allowed git command non-interactive', () => {
		const result = applyVcsCommandPolicy('git commit -m "fix thing"');
		expect(result).toEqual({ action: 'allow', command: `${NONINTERACTIVE_VCS_ENV}git commit -m "fix thing"` });
	});

	it('leaves non-VCS commands untouched', () => {
		expect(applyVcsCommandPolicy('pnpm run check:staged')).toEqual({ action: 'allow', command: 'pnpm run check:staged' });
	});

	it('does not treat a commit message containing -n as a bypass flag', () => {
		expect(applyVcsCommandPolicy('git commit -m "document -n flag"')).toMatchObject({ action: 'allow' });
	});
});

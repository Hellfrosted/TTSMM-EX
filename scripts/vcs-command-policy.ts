import { readFileSync } from 'node:fs';
import { isExecutedDirectly } from './lib/is-main';

/**
 * Policy for VCS commands run by agents in this repo.
 *
 * Ported and adapted from joelhooks/rat-stack `scripts/vcs-command-policy.js`
 * (MIT). The husky hooks in this repo run `pnpm run check:staged`; a command
 * that skips them defeats the fence. This module is the single testable
 * definition of "skips the hooks", used by docs and by harness integrations.
 */

const VCS_COMMAND = /(?:^|[\s;&|()])(?:[^\s;&|()]*\/)?(?:git|jj)(?=$|[\s;&|()])/mu;

export const NONINTERACTIVE_VCS_ENV = 'export GIT_EDITOR=: GIT_SEQUENCE_EDITOR=: GIT_MERGE_AUTOEDIT=no JJ_EDITOR=:;\n';

export const HOOK_BYPASS_REASON =
	'Blocked hook bypass: this command skips or disables the Git hooks. The hooks run `pnpm run check:staged`, the fence every commit must pass. Fix: drop the bypass (`--no-verify`, `git commit -n`, `HUSKY=0`, `core.hooksPath`, or an edit under `.husky/` or `.git/hooks/`), read the hook output, and fix the failure. Ask the owner before changing the hooks.';

const SEGMENT_BREAKS = new Set([';', '&', '|', '(', ')', '`', '\n']);
const REDIRECTS = new Set(['>', '>>', '>|']);
const SHELLS = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);
const WRAPPERS = new Set(['command', 'env', 'exec', 'nohup', 'sudo', 'time']);
const HOOK_READERS = new Set([
	'[',
	'bat',
	'cat',
	'diff',
	'file',
	'grep',
	'head',
	'less',
	'ls',
	'more',
	'rg',
	'stat',
	'tail',
	'test',
	'tree',
	'wc'
]);
const GIT_GLOBALS_WITH_VALUE = new Set(['--exec-path', '--git-dir', '--namespace', '--super-prefix', '--work-tree', '-C']);
const COMMIT_SHORT_WITH_VALUE = new Set(['C', 'F', 'c', 'm', 't']);
const COMMIT_LONG_WITH_VALUE = new Set([
	'--author',
	'--cleanup',
	'--date',
	'--file',
	'--fixup',
	'--message',
	'--pathspec-from-file',
	'--reedit-message',
	'--reuse-message',
	'--squash',
	'--template',
	'--trailer'
]);
const CONFIG_READS = new Set([
	'--get',
	'--get-all',
	'--get-regexp',
	'--list',
	'--show-origin',
	'--unset',
	'--unset-all',
	'-l',
	'get',
	'list',
	'unset'
]);
const HOOK_PATHS = ['.git/hooks', '.husky/_', '.husky/pre-commit', '.husky/pre-push'];
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
const NO_VERIFY = '--no-verify';
const NO_VERIFY_SHORTEST_PREFIX = '--no-ver'.length;

interface ShellToken {
	text: string;
	operator: boolean;
	assignable: boolean;
}

export type CommandPolicyResult = { action: 'allow'; command: string } | { action: 'block'; reason: string };

// fallow-ignore-next-line complexity -- shell tokenizer mirrors the canonical rat-stack policy; splitting it risks parser drift.
function segmentsOf(command: string): ShellToken[][] {
	const segments: ShellToken[][] = [[]];
	let text = '';
	let started = false;
	let assignable = true;
	let quote: "'" | '"' | null = null;
	const current = () => segments.at(-1) ?? [];
	const finish = () => {
		if (started) current().push({ assignable, operator: false, text });
		text = '';
		started = false;
		assignable = true;
	};

	for (let index = 0; index < command.length; index += 1) {
		const char = command.charAt(index);
		if (quote !== null) {
			if (char === quote) quote = null;
			else if (char === '\\' && quote === '"' && index + 1 < command.length) {
				index += 1;
				text += command.charAt(index);
			} else text += char;
		} else if (char === "'" || char === '"') {
			if (!started) assignable = false;
			quote = char;
			started = true;
		} else if (char === '\\' && index + 1 < command.length) {
			index += 1;
			text += command.charAt(index);
			started = true;
		} else if (/\s/u.test(char) && char !== '\n') {
			finish();
		} else if (SEGMENT_BREAKS.has(char)) {
			finish();
			segments.push([]);
		} else if (char === '>') {
			finish();
			const next = command.charAt(index + 1);
			const operator = next === '>' || next === '|' ? `>${next}` : '>';
			index += operator.length - 1;
			current().push({ assignable: false, operator: true, text: operator });
		} else {
			text += char;
			started = true;
		}
	}
	finish();
	return segments.filter((segment) => segment.length > 0);
}

function basename(word: string) {
	return word.slice(word.lastIndexOf('/') + 1);
}

function disablesHooks(shellToken: ShellToken): boolean {
	if (!shellToken.assignable || !ASSIGNMENT.test(shellToken.text)) return false;
	const [name = '', ...rest] = shellToken.text.split('=');
	const value = rest.join('=').trim().toLowerCase();
	return (name === 'HUSKY' || name === 'LEFTHOOK') && (value === '0' || value === 'false');
}

function withoutPrefixes(words: ShellToken[]): ShellToken[] {
	const index = words.findIndex(
		(shellToken) => !(shellToken.assignable && ASSIGNMENT.test(shellToken.text)) && !WRAPPERS.has(basename(shellToken.text))
	);
	return index === -1 ? [] : words.slice(index);
}

function isNoVerify(arg: string): boolean {
	return arg.length >= NO_VERIFY_SHORTEST_PREFIX && NO_VERIFY.startsWith(arg);
}

function setsHooksPath(setting: string): boolean {
	return setting.split('=')[0]?.trim().toLowerCase() === 'core.hookspath';
}

// fallow-ignore-next-line complexity -- one branch per git commit flag form; behavior is pinned by tests.
function commitSkipsHooks(args: string[]): boolean {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? '';
		if (arg === '--') return false;
		if (isNoVerify(arg)) return true;
		if (COMMIT_LONG_WITH_VALUE.has(arg)) {
			index += 1;
		} else if (/^-[^-]/u.test(arg)) {
			for (let flag = 1; flag < arg.length; flag += 1) {
				const char = arg.charAt(flag);
				if (char === 'n') return true;
				if (COMMIT_SHORT_WITH_VALUE.has(char)) {
					if (flag === arg.length - 1) index += 1;
					break;
				}
			}
		}
	}
	return false;
}

function configSetsHooksPath(args: string[]): boolean {
	const key = args.findIndex(setsHooksPath);
	if (key === -1) return false;
	if (args.some((arg) => CONFIG_READS.has(arg))) return false;
	return (args[key] ?? '').includes('=') || key < args.length - 1;
}

// fallow-ignore-next-line complexity -- one branch per git global/config bypass form; behavior is pinned by tests.
function gitSkipsHooks(args: string[]): boolean {
	let index = 0;
	while (index < args.length && (args[index] ?? '').startsWith('-')) {
		const option = args[index] ?? '';
		if (option === '-c') {
			if (setsHooksPath(args[index + 1] ?? '')) return true;
			index += 2;
		} else if (option.startsWith('-c') && option.length > 2) {
			if (setsHooksPath(option.slice(2))) return true;
			index += 1;
		} else if (option.startsWith('--config-env=')) {
			if (setsHooksPath(option.slice('--config-env='.length))) return true;
			index += 1;
		} else {
			index += GIT_GLOBALS_WITH_VALUE.has(option) ? 2 : 1;
		}
	}
	const [subcommand = '', ...rest] = args.slice(index);
	if (subcommand === 'commit' && commitSkipsHooks(rest)) return true;
	if (rest.some(isNoVerify)) return true;
	return subcommand === 'config' && configSetsHooksPath(rest);
}

function touchesHookFiles(segment: ShellToken[]): boolean {
	const words = withoutPrefixes(segment.filter((shellToken) => !shellToken.operator));
	const program = basename(words[0]?.text ?? '');
	return segment.some((shellToken, index) => {
		if (!HOOK_PATHS.some((path) => shellToken.text.includes(path)) || shellToken.operator) return false;
		const previous = segment[index - 1];
		return (previous !== undefined && previous.operator && REDIRECTS.has(previous.text)) || !HOOK_READERS.has(program);
	});
}

function segmentSkipsHooks(segment: ShellToken[], nested: (command: string) => boolean): boolean {
	if (segment.some(disablesHooks) || touchesHookFiles(segment)) return true;
	const words = withoutPrefixes(segment.filter((shellToken) => !shellToken.operator));
	const [program, ...args] = words.map((shellToken) => shellToken.text);
	const name = basename(program ?? '');
	if (name === 'git') return gitSkipsHooks(args);
	if (name === 'export') return words.slice(1).some(disablesHooks);
	if (SHELLS.has(name)) {
		const script = args.findIndex((arg) => /^-[a-z]*c[a-z]*$/u.test(arg));
		return script !== -1 && nested(args[script + 1] ?? '');
	}
	return false;
}

function skipsHooks(command: string): boolean {
	return segmentsOf(command).some((segment) => segmentSkipsHooks(segment, skipsHooks));
}

export function applyVcsCommandPolicy(command: string): CommandPolicyResult {
	if (skipsHooks(command)) return { action: 'block', reason: HOOK_BYPASS_REASON };
	if (!VCS_COMMAND.test(command)) return { action: 'allow', command };
	return { action: 'allow', command: `${NONINTERACTIVE_VCS_ENV}${command}` };
}

// Codex PreToolUse hook adapter: reads base64-encoded shell commands on stdin
// and emits a deny decision for the first one that skips the hooks.
if (isExecutedDirectly(import.meta.url)) {
	const encodedCommands = readFileSync(0, 'utf8').split(/\r?\n/u).filter(Boolean);
	const blocked = encodedCommands
		.map((encoded) => applyVcsCommandPolicy(Buffer.from(encoded, 'base64').toString('utf8')))
		.find((result) => result.action === 'block');

	if (blocked?.action === 'block') {
		process.stdout.write(
			`${JSON.stringify({
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'deny',
					permissionDecisionReason: blocked.reason
				}
			})}\n`
		);
	}
}

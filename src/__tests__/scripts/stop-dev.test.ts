// @vitest-environment node

import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWindowsProcessList, stopDevServer } from '../../../scripts/stop-dev';

const repoRoot = process.cwd();
const devScriptPath = path.join(repoRoot, 'scripts', 'vite-dev.ts');
const wrapperScriptPath = path.join(repoRoot, 'scripts', 'run-with-clean-electron-env.ts');

afterEach(() => {
	vi.restoreAllMocks();
});

describe('stop-dev', () => {
	it('parses Windows CIM process output for a single process', () => {
		expect(
			parseWindowsProcessList(
				JSON.stringify({
					pid: 42,
					name: 'node.exe',
					ppid: 7,
					cmd: `node --import=tsx ${devScriptPath}`
				})
			)
		).toEqual([
			{
				pid: 42,
				name: 'node.exe',
				ppid: 7,
				cmd: `node --import=tsx ${devScriptPath}`
			}
		]);
	});

	it('sends SIGTERM only to the vite-dev process', async () => {
		const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

		await expect(
			stopDevServer([
				{
					pid: 11,
					name: 'node',
					ppid: 1,
					cmd: `node --import=tsx ${wrapperScriptPath} node --import=tsx ${devScriptPath}`
				},
				{
					pid: 12,
					name: 'node',
					ppid: 11,
					cmd: `node --import=tsx ${devScriptPath}`
				},
				{
					pid: 13,
					name: 'node',
					ppid: 1,
					cmd: 'node --import=tsx ./scripts/help.ts'
				}
			])
		).resolves.toEqual([12]);

		expect(killSpy).toHaveBeenCalledTimes(1);
		expect(killSpy).toHaveBeenCalledWith(12, 'SIGTERM');
	});
});

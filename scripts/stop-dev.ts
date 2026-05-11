import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import psList, { type ProcessDescriptor } from 'ps-list';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const devScriptPath = path.join(repoRoot, 'scripts', 'vite-dev.ts');
const cleanElectronEnvScriptPath = path.join(repoRoot, 'scripts', 'run-with-clean-electron-env.ts');

function normalizePath(value: string) {
	return path.normalize(value).replaceAll('\\', '/');
}

function isDevServerProcess(processInfo: ProcessDescriptor) {
	if (processInfo.pid === process.pid || !processInfo.cmd) {
		return false;
	}

	const command = normalizePath(processInfo.cmd);
	const isDevScript = command.includes(normalizePath(devScriptPath)) || command.includes('./scripts/vite-dev.ts');
	const isWrapperScript =
		command.includes(normalizePath(cleanElectronEnvScriptPath)) || command.includes('./scripts/run-with-clean-electron-env.ts');

	return isDevScript && !isWrapperScript;
}

interface WindowsProcessDescriptor {
	pid?: number;
	name?: string;
	ppid?: number;
	cmd?: string;
	ProcessId?: number;
	Name?: string;
	ParentProcessId?: number;
	CommandLine?: string;
}

export function parseWindowsProcessList(rawOutput: string): ProcessDescriptor[] {
	const trimmedOutput = rawOutput.trim();
	if (!trimmedOutput) {
		return [];
	}

	const parsed = JSON.parse(trimmedOutput) as WindowsProcessDescriptor | WindowsProcessDescriptor[];
	const processes = Array.isArray(parsed) ? parsed : [parsed];
	return processes.flatMap((processInfo) => {
		const pid = processInfo.pid ?? processInfo.ProcessId;
		if (pid === undefined) {
			return [];
		}

		return [
			{
				pid,
				name: processInfo.name ?? processInfo.Name ?? '',
				ppid: processInfo.ppid ?? processInfo.ParentProcessId ?? 0,
				cmd: processInfo.cmd ?? processInfo.CommandLine
			}
		];
	});
}

async function getWindowsProcesses() {
	const script = [
		'$processes = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*vite-dev.ts*" } | Select-Object @{Name="pid";Expression={$_.ProcessId}}, @{Name="name";Expression={$_.Name}}, @{Name="ppid";Expression={$_.ParentProcessId}}, @{Name="cmd";Expression={$_.CommandLine}}',
		'if ($null -eq $processes) { "[]" } else { $processes | ConvertTo-Json -Compress }'
	].join('; ');
	const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
		windowsHide: true
	});

	return parseWindowsProcessList(stdout);
}

async function getCandidateProcesses() {
	if (process.platform === 'win32') {
		return getWindowsProcesses();
	}

	return psList();
}

export async function stopDevServer(processes?: ProcessDescriptor[]) {
	const candidateProcesses = processes ?? (await getCandidateProcesses());
	const devProcesses = candidateProcesses.filter(isDevServerProcess);

	for (const processInfo of devProcesses) {
		process.kill(processInfo.pid, 'SIGTERM');
	}

	return devProcesses.map((processInfo) => processInfo.pid);
}

function isExecutedDirectly() {
	if (!process.argv[1]) {
		return false;
	}

	return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isExecutedDirectly()) {
	void stopDevServer()
		.then((pids) => {
			if (pids.length === 0) {
				console.log('No TTSMM-EX dev server process found.');
				return;
			}

			console.log(`Sent SIGTERM to TTSMM-EX dev server process ${pids.join(', ')}.`);
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}

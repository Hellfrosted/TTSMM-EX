import net from 'node:net';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { terminalStyle } from './lib/terminal-style';

interface PortCheckOptions {
	hosts?: Array<string | undefined>;
	port?: number;
	rawPort?: string;
}

export function parseConfiguredPort(rawPort = process.env.PORT || '1212') {
	return Number.parseInt(rawPort, 10);
}

export function getMachineHosts(networkInterfaces = os.networkInterfaces()) {
	return Object.values(networkInterfaces)
		.flatMap((addresses) => addresses ?? [])
		.filter((address) => !address.internal && address.family === 'IPv4')
		.map((address) => address.address);
}

export function createProbeHosts(machineHosts = getMachineHosts()) {
	return [undefined, '0.0.0.0', '127.0.0.1', 'localhost', '::1', ...machineHosts];
}

export function assertPortAvailable(port: number, host: string | undefined) {
	return new Promise<void>((resolve, reject) => {
		const server = net.createServer();
		server.once('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'EADDRINUSE') {
				reject(
					new Error(
						terminalStyle.danger(`Port "${port}" on "localhost" is already in use. Please use another port. ex: PORT=4343 pnpm run dev`)
					)
				);
				return;
			}

			if (error.code === 'EADDRNOTAVAIL') {
				resolve();
				return;
			}

			reject(error);
		});
		const onListening = () => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		};
		if (host === undefined) {
			server.listen(port, onListening);
			return;
		}
		server.listen(port, host, onListening);
	});
}

export async function assertConfiguredPortAvailable(options: PortCheckOptions = {}) {
	const port = options.port ?? parseConfiguredPort(options.rawPort);
	const hosts = options.hosts ?? createProbeHosts();

	for (const host of hosts) {
		await assertPortAvailable(port, host);
	}
}

export async function runCheckPortInUseCli(options: PortCheckOptions = {}) {
	try {
		await assertConfiguredPortAvailable(options);
		return 0;
	} catch (error) {
		console.error((error as Error).message);
		return 1;
	}
}

function isExecutedDirectly() {
	if (!process.argv[1]) {
		return false;
	}

	return pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isExecutedDirectly()) {
	void runCheckPortInUseCli().then((exitCode) => {
		process.exit(exitCode);
	});
}

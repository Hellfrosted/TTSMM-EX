import net from 'node:net';
import os from 'node:os';
import { terminalStyle } from './lib/terminal-style';

const port = Number.parseInt(process.env.PORT || '1212', 10);
const machineHosts = Object.values(os.networkInterfaces())
	.flatMap((addresses) => addresses ?? [])
	.filter((address) => !address.internal && address.family === 'IPv4')
	.map((address) => address.address);
const probeHosts = [undefined, '0.0.0.0', '127.0.0.1', 'localhost', '::1', ...machineHosts];

function assertPortAvailable(host: string | undefined) {
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

async function main() {
	for (const host of probeHosts) {
		await assertPortAvailable(host);
	}
}

void main().catch((error: Error) => {
	console.error(error.message);
	process.exit(1);
});

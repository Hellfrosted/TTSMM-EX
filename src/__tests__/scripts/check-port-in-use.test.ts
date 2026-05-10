// @vitest-environment node

import { execFileSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const scriptArgs = ['--import=tsx', './scripts/check-port-in-use.ts'];
let openServers: net.Server[] = [];

function listen(port = 0, host = 'localhost') {
	return new Promise<net.Server>((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(port, host, () => {
			openServers.push(server);
			resolve(server);
		});
	});
}

function closeServer(server: net.Server) {
	return new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

function getServerPort(server: net.Server) {
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Expected server to listen on an IP port.');
	}
	return address.port;
}

function runPortCheck(port: string | number) {
	return execFileSync(process.execPath, scriptArgs, {
		cwd: process.cwd(),
		env: {
			...process.env,
			PORT: String(port)
		},
		encoding: 'utf8'
	});
}

function getMachineIpAddress() {
	return Object.values(os.networkInterfaces())
		.flatMap((addresses) => addresses ?? [])
		.find((address) => !address.internal && address.family === 'IPv4')?.address;
}

afterEach(async () => {
	const servers = openServers;
	openServers = [];
	await Promise.all(servers.map((server) => closeServer(server)));
});

describe('check-port-in-use', () => {
	it('exits cleanly when the requested localhost port is free', async () => {
		const server = await listen();
		const port = getServerPort(server);
		openServers = [];
		await closeServer(server);

		expect(() => runPortCheck(port)).not.toThrow();
	});

	it('fails when the requested localhost port is already in use', async () => {
		const server = await listen();
		const port = getServerPort(server);

		expect(() => runPortCheck(port)).toThrow(/already in use/);
	});

	it('fails when the requested IPv4 loopback port is already in use', async () => {
		const server = await listen(0, '127.0.0.1');
		const port = getServerPort(server);

		expect(() => runPortCheck(port)).toThrow(/already in use/);
	});

	it('fails when the requested wildcard IPv4 port is already in use', async () => {
		const server = await listen(0, '0.0.0.0');
		const port = getServerPort(server);

		expect(() => runPortCheck(port)).toThrow(/already in use/);
	});

	it('fails when the requested machine IP port is already in use', async () => {
		const machineIpAddress = getMachineIpAddress();
		if (!machineIpAddress) {
			return;
		}
		const server = await listen(0, machineIpAddress);
		const port = getServerPort(server);

		expect(() => runPortCheck(port)).toThrow(/already in use/);
	});

	it('fails when the requested IPv6 loopback port is already in use', async () => {
		let server: net.Server;
		try {
			server = await listen(0, '::1');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EADDRNOTAVAIL') {
				return;
			}
			throw error;
		}
		const port = getServerPort(server);

		expect(() => runPortCheck(port)).toThrow(/already in use/);
	});

	it('parses PORT the same way as the Vite config', async () => {
		const server = await listen();
		const port = getServerPort(server);

		expect(() => runPortCheck(`${port}abc`)).toThrow(/already in use/);
	});
});

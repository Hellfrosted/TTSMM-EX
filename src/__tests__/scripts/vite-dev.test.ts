// @vitest-environment node

import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.useRealTimers();
	vi.doUnmock('node:child_process');
	vi.doUnmock('electron');
	vi.doUnmock('vite');
	vi.doUnmock('../../../vite.config');
	vi.resetModules();
});

it('keeps the current Electron process when the previous process exits late', async () => {
	vi.useFakeTimers();
	const mainWatcher = new EventEmitter();
	const preloadWatcher = new EventEmitter();
	const children: Array<EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean }> = [];
	const spawn = vi.fn(() => {
		const child = Object.assign(new EventEmitter(), { kill: vi.fn(), killed: false });
		children.push(child);
		return child;
	});
	vi.doMock('node:child_process', () => ({ spawn }));
	vi.doMock('electron', () => ({ default: 'electron' }));
	vi.doMock('vite', () => ({
		createServer: vi.fn(async () => ({ listen: vi.fn(), printUrls: vi.fn(), resolvedUrls: { local: ['http://localhost:1212/'] } })),
		build: vi.fn().mockResolvedValueOnce(mainWatcher).mockResolvedValueOnce(preloadWatcher)
	}));
	vi.doMock('../../../vite.config', () => ({
		createMainConfig: () => ({}),
		createPreloadConfig: () => ({}),
		createRendererConfig: () => ({})
	}));
	const events = ['SIGINT', 'SIGTERM', 'SIGHUP', 'exit', 'uncaughtException', 'unhandledRejection'] as const;
	const existing = new Map(events.map((event) => [event, process.rawListeners(event)]));
	try {
		await import('../../../scripts/vite-dev');
		for (let i = 0; i < 10; i += 1) await Promise.resolve();
		mainWatcher.emit('event', { code: 'END' });
		preloadWatcher.emit('event', { code: 'END' });
		await vi.advanceTimersByTimeAsync(100);
		mainWatcher.emit('event', { code: 'END' });
		await vi.advanceTimersByTimeAsync(100);
		expect(children).toHaveLength(2);
		children[0]?.emit('exit');
		mainWatcher.emit('event', { code: 'END' });
		await vi.advanceTimersByTimeAsync(100);
		expect(children[1]?.kill).toHaveBeenCalledOnce();
	} finally {
		for (const event of events) {
			for (const listener of process.rawListeners(event)) {
				if (!existing.get(event)?.includes(listener)) process.removeListener(event, listener as (...args: never[]) => void);
			}
		}
	}
});

import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

describe('main Effect runtime', () => {
	it('includes the main-process Effect platform-node proof layer', async () => {
		const { MainPlatformNodeProofLayer } = await import('../../main/platform-node-proof');

		expect(MainPlatformNodeProofLayer).toBeDefined();
	});

	it('memoizes the main runtime layer across runs', async () => {
		vi.resetModules();
		const fetchModInventory = vi.fn(() => Effect.succeed([]));
		vi.doMock('../../main/mod-fetcher', async () => {
			const actual = await vi.importActual<typeof import('../../main/mod-fetcher')>('../../main/mod-fetcher');
			return {
				...actual,
				createModInventoryContext: vi.fn(() => ({})),
				fetchModInventory
			};
		});

		const [{ ModInventoryScanner }, { MainRuntimeLayer, runMain }] = await Promise.all([
			import('../../main/mod-inventory-scan'),
			import('../../main/runtime')
		]);
		const build = vi.spyOn(MainRuntimeLayer, 'build');
		const request = {
			knownWorkshopMods: [],
			progressSender: { send: vi.fn() }
		};
		const program = ModInventoryScanner.use((scanner) => scanner.scan(request));

		await runMain(program);
		await runMain(program);

		expect(build).toHaveBeenCalledTimes(1);
		expect(fetchModInventory).toHaveBeenCalledTimes(2);
	});
});

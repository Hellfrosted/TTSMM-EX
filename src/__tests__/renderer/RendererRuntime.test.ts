import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { RendererElectron, RendererRuntimeLayer, runRenderer } from '../../renderer/runtime';

describe('renderer Effect runtime', () => {
	it('memoizes the renderer runtime layer across runs', async () => {
		const build = vi.spyOn(RendererRuntimeLayer, 'build');
		const program = RendererElectron.use((renderer) => Effect.succeed(renderer.electron.platform));

		await expect(runRenderer(program)).resolves.toBe(window.electron.platform);
		await expect(runRenderer(program)).resolves.toBe(window.electron.platform);

		expect(build).toHaveBeenCalledTimes(1);
	});
});

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { persistViewConfigChange } from '../../renderer/view-config-command';

describe('view-config-command', () => {
	it('persists view config changes and commits the saved config to app state', async () => {
		const nextConfig = {
			...DEFAULT_CONFIG,
			currentPath: '/block-lookup',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		const updateState = vi.fn();
		const openNotification = vi.fn();
		const logger = {
			error: vi.fn()
		};

		await expect(
			persistViewConfigChange({
				logger,
				nextConfig,
				openNotification,
				updateState
			})
		).resolves.toBe(true);

		expect(window.electron.updateConfig).toHaveBeenCalledWith(nextConfig);
		expect(updateState).toHaveBeenCalledWith({ config: nextConfig });
		expect(openNotification).not.toHaveBeenCalled();
	});

	it('logs and reports rejected view config writes without committing app state', async () => {
		const nextConfig = {
			...DEFAULT_CONFIG,
			currentPath: '/block-lookup',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		};
		const updateState = vi.fn();
		const openNotification = vi.fn();
		const logger = {
			error: vi.fn()
		};
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(null);

		await expect(
			persistViewConfigChange({
				logger,
				nextConfig,
				openNotification,
				updateState
			})
		).resolves.toBe(false);

		expect(updateState).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(expect.any(Error));
		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to update view settings',
				placement: 'bottomLeft',
				duration: null
			},
			'error'
		);
	});
});

import { describe, expect, it } from 'vitest';
import { cloneAppConfig } from '../../renderer/hooks/collections/utils';
import { createTestConfig } from './test-utils';

describe('cloneAppConfig', () => {
	it('preserves Population Pool settings and copies their mutable fields', () => {
		const config = createTestConfig({
			viewConfigs: {
				populationPool: {
					smallRows: true,
					columnOrder: ['path', 'name'],
					columnWidthConfig: { name: 280 },
					columnActiveConfig: { path: false }
				}
			}
		});
		const copy = cloneAppConfig(config);
		expect(copy.viewConfigs.populationPool).toEqual(config.viewConfigs.populationPool);
		expect(copy.viewConfigs.populationPool?.columnOrder).not.toBe(config.viewConfigs.populationPool?.columnOrder);
		expect(copy.viewConfigs.populationPool?.columnWidthConfig).not.toBe(config.viewConfigs.populationPool?.columnWidthConfig);
		expect(copy.viewConfigs.populationPool?.columnActiveConfig).not.toBe(config.viewConfigs.populationPool?.columnActiveConfig);
	});
});

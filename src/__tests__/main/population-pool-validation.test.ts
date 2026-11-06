import { describe, expect, it } from 'vitest';
import { parsePopulationFileOperation, parsePopulationScan } from '../../main/ipc/population-pool-validation';
import { ValidChannel } from '../../model';

describe('population pool IPC validation', () => {
	it('rejects malformed scan paths', () => {
		expect(() => parsePopulationScan(ValidChannel.POPULATION_POOL_SCAN, { localDir: 42 })).toThrow('Invalid IPC payload');
	});

	it('rejects non-boolean confirmations before file operations', () => {
		expect(() =>
			parsePopulationFileOperation(ValidChannel.POPULATION_POOL_DISABLE, {
				row: {
					id: 'a',
					name: 'a',
					source: 'active',
					sourceLabel: 'Active',
					status: 'Active',
					compatibility: 'compatible',
					compatibilityLabel: 'Compatible',
					canStableAdd: false,
					canDisable: true,
					canRestore: false,
					canRequestWorkshopAdd: false
				},
				confirmedWhileGameRunning: 'false'
			})
		).toThrow('Invalid IPC payload');
	});
});

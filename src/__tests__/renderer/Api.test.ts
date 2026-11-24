import { describe, expect, it } from 'vitest';
import api from '../../renderer/Api';
import { createGameLaunchCommand } from '../../renderer/game-launch-command';
import { ipcInvokeChannels } from '../../shared/ipc-contract';

describe('renderer API helpers', () => {
	it('projects every invoke contract method onto the renderer API', () => {
		const apiMethodFor = (method: keyof typeof ipcInvokeChannels) => (method === 'isGameRunning' ? 'gameRunning' : method);

		for (const method of Object.keys(ipcInvokeChannels) as Array<keyof typeof ipcInvokeChannels>) {
			expect(typeof api[apiMethodFor(method) as keyof typeof api]).toBe('function');
		}
	});

	it('builds TerraTech launch arguments outside the IPC adapter', () => {
		expect(
			createGameLaunchCommand({
				workshopID: BigInt(2571814511),
				modList: [
					{ uid: 'workshop:2571814511', id: 'ModManager', type: 'workshop', workshopID: BigInt(2571814511) },
					{ uid: 'local:My Mod', id: 'MyMod', type: 'local' }
				],
				logParams: {
					'': 'debug',
					Blocks: 'info'
				},
				extraParams: `  "quoted arg"   'another arg' +flag  `
			})
		).toEqual({
			workshopID: '2571814511',
			args: [
				'+ttsmm_mod_list',
				'[[local:My:/%20Mod]]',
				'+log_level',
				'debug',
				'+log_level_Blocks',
				'info',
				'quoted arg',
				'another arg',
				'+flag'
			]
		});
	});

	it('omits the workshop id for pure vanilla launches with only Mod Manager selected', () => {
		expect(
			createGameLaunchCommand({
				workshopID: BigInt(2571814511),
				modList: [{ uid: 'workshop:2571814511', id: 'ModManager', type: 'workshop', workshopID: BigInt(2571814511) }],
				pureVanilla: true
			})
		).toEqual({
			workshopID: null,
			args: []
		});
	});
});

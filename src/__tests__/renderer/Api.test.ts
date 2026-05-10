import { describe, expect, it } from 'vitest';

import { parseExtraLaunchParams } from '../../renderer/Api';
import { createGameLaunchCommand } from '../../renderer/game-launch-command';

describe('renderer API helpers', () => {
	it('parses quoted additional launch arguments without splitting embedded spaces', () => {
		expect(parseExtraLaunchParams('  +foo   "bar baz" \'qux quux\' plain  ')).toEqual(['+foo', 'bar baz', 'qux quux', 'plain']);
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
				extraParams: '"quoted arg" +flag'
			})
		).toEqual({
			workshopID: '2571814511',
			args: ['+ttsmm_mod_list', '[[local:My:/%20Mod]]', '+log_level', 'debug', '+log_level_Blocks', 'info', 'quoted arg', '+flag']
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

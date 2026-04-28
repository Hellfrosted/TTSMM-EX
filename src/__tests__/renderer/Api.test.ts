import { describe, expect, it } from 'vitest';

import { API, parseExtraLaunchParams } from '../../renderer/Api';

const forbiddenLifecycleShortcuts = ['createCollection', 'renameCollection', 'deleteCollection', 'switchCollection'];

describe('renderer API helpers', () => {
	it('parses quoted additional launch arguments without splitting embedded spaces', () => {
		expect(parseExtraLaunchParams('  +foo   "bar baz" \'qux quux\' plain  ')).toEqual([
			'+foo',
			'bar baz',
			'qux quux',
			'plain'
		]);
	});

	it('does not expose direct collection lifecycle shortcuts', () => {
		const api = new API(window);

		for (const shortcut of forbiddenLifecycleShortcuts) {
			expect(api).not.toHaveProperty(shortcut);
		}
	});

	it('routes lifecycle commands through the preload lifecycle command contract', async () => {
		const api = new API(window);
		const command = { action: 'rename' as const, collection: { name: 'default', mods: [] }, newName: 'renamed' };

		await api.executeCollectionLifecycleCommand(command);

		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith(command);
	});

	it('keeps collection content save separate from lifecycle commands', async () => {
		const api = new API(window);
		const collection = { name: 'default', mods: ['local:one'] };

		await api.saveCollectionContent(collection);

		expect(window.electron.saveCollectionContent).toHaveBeenCalledWith(collection);
		expect(window.electron.executeCollectionLifecycleCommand).not.toHaveBeenCalled();
	});
});

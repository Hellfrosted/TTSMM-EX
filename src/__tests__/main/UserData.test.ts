import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { FORK_USER_DATA_DIR, USER_DATA_DIR_OVERRIDE_ENV, resolveUserDataPath } from '../../main/user-data';

describe('user data path', () => {
	it('uses the fork-specific Electron app data directory by default', () => {
		const appApi = {
			getPath: vi.fn(() => path.join('C:', 'Users', 'tester', 'AppData', 'Roaming'))
		};

		expect(resolveUserDataPath(appApi as never, {})).toBe(path.join('C:', 'Users', 'tester', 'AppData', 'Roaming', FORK_USER_DATA_DIR));
		expect(appApi.getPath).toHaveBeenCalledWith('appData');
	});

	it('uses an explicit override for isolated smoke runs', () => {
		const appApi = {
			getPath: vi.fn()
		};
		const overridePath = path.join('C:', 'Temp', 'ttsmm-smoke-profile');

		expect(resolveUserDataPath(appApi as never, { [USER_DATA_DIR_OVERRIDE_ENV]: overridePath })).toBe(path.resolve(overridePath));
		expect(appApi.getPath).not.toHaveBeenCalled();
	});
});

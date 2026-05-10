import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORK_USER_DATA_DIR, resolveUserDataPath } from '../../main/user-data';
import { USER_DATA_DIR_OVERRIDE_ENV } from '../../shared/user-data';

const originalArgv = process.argv;

afterEach(() => {
	process.argv = originalArgv;
});

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

	it('uses the dashed argv override for isolated runs', () => {
		const appApi = {
			getPath: vi.fn()
		};
		const overridePath = path.join('C:', 'Temp', 'ttsmm-argv-profile');
		process.argv = ['electron', '.', `--ttsmm-ex-user-data-dir=${overridePath}`];

		expect(resolveUserDataPath(appApi as never, {})).toBe(path.resolve(overridePath));
		expect(appApi.getPath).not.toHaveBeenCalled();
	});

	it('uses the plain argv override when Electron strips leading dashes', () => {
		const appApi = {
			getPath: vi.fn()
		};
		const overridePath = path.join('C:', 'Temp', 'ttsmm-plain-argv-profile');
		process.argv = ['electron', '.', `ttsmm-ex-user-data-dir=${overridePath}`];

		expect(resolveUserDataPath(appApi as never, {})).toBe(path.resolve(overridePath));
		expect(appApi.getPath).not.toHaveBeenCalled();
	});
});

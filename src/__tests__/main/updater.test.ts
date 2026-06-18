// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const autoUpdaterMock = vi.hoisted(() => ({
	autoDownload: true,
	checkForUpdates: vi.fn(),
	downloadUpdate: vi.fn(),
	logger: null,
	on: vi.fn(),
	quitAndInstall: vi.fn()
}));

vi.mock('electron-updater', () => ({
	autoUpdater: autoUpdaterMock
}));

vi.mock('electron', () => ({
	dialog: {
		showErrorBox: vi.fn(),
		showMessageBox: vi.fn()
	}
}));

vi.mock('electron-log', () => ({
	default: {
		error: vi.fn()
	}
}));

describe('updater', () => {
	beforeEach(() => {
		vi.resetModules();
		autoUpdaterMock.autoDownload = true;
		autoUpdaterMock.checkForUpdates.mockReset();
		autoUpdaterMock.downloadUpdate.mockReset();
		autoUpdaterMock.logger = null;
		autoUpdaterMock.on.mockReset();
		autoUpdaterMock.quitAndInstall.mockReset();
	});

	it('checks for startup updates without registering menu update listeners', async () => {
		autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
		const { checkForStartupUpdates } = await import('../../main/updater');

		checkForStartupUpdates();
		await Promise.resolve();

		expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledOnce();
		expect(autoUpdaterMock.on).not.toHaveBeenCalled();
		expect(autoUpdaterMock.autoDownload).toBe(true);
	});

	it('disables and restores the menu item when a manual update check fails', async () => {
		let rejectUpdateCheck: (error: Error) => void = () => {};
		const updateCheck = new Promise<never>((_, reject) => {
			rejectUpdateCheck = reject;
		});
		autoUpdaterMock.checkForUpdates.mockReturnValue(updateCheck);
		const { checkForMenuUpdates } = await import('../../main/updater');
		const menuItem = { enabled: true };

		checkForMenuUpdates(menuItem);
		expect(menuItem.enabled).toBe(false);

		rejectUpdateCheck(new Error('offline'));
		await updateCheck.catch(() => undefined);

		expect(menuItem.enabled).toBe(true);
	});
});

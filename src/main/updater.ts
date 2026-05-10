/**
 * Adapted from: https://github.com/electron-userland/electron-builder/blob/docs-deprecated/encapsulated%20manual%20update%20via%20menu.js
 *
 * Import steps:
 * 1. create `updater.js` for the code snippet
 * 2. require `updater.js` for menu implementation, and set `checkForUpdates` callback from `updater` for the click property of `Check Updates...` MenuItem.
 */
import { dialog, MenuItem } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';

let updater: MenuItem | null = null;
autoUpdater.autoDownload = false;
autoUpdater.logger = log;

function resetUpdaterMenuItem() {
	if (updater) {
		updater.enabled = true;
		updater = null;
	}
}

autoUpdater.on('error', (error: Error) => {
	dialog.showErrorBox('Error: ', error == null ? 'unknown' : (error.stack || error).toString());
	resetUpdaterMenuItem();
});

autoUpdater.on('update-available', () => {
	void (async () => {
		try {
			const res = await dialog.showMessageBox({
				type: 'info',
				title: 'Found Updates',
				message: 'Found updates, do you want update now?',
				buttons: ['Yes', 'No']
			});
			if (res.response === 0) {
				await autoUpdater.downloadUpdate();
				return;
			}
			resetUpdaterMenuItem();
		} catch (error) {
			log.error(error);
			resetUpdaterMenuItem();
		}
	})();
});

autoUpdater.on('update-not-available', () => {
	if (updater) {
		void dialog.showMessageBox({
			title: 'No Updates',
			message: 'Current version is up-to-date.'
		}).catch((error) => {
			log.error(error);
		});
		resetUpdaterMenuItem();
	}
});

autoUpdater.on('update-downloaded', () => {
	void dialog
		.showMessageBox({
			title: 'Install Updates',
			message: 'Updates downloaded, application will quit for update...'
		})
		.then(() => {
			setImmediate(() => autoUpdater.quitAndInstall());
			return undefined;
		})
		.catch((error) => {
			log.error(error);
			resetUpdaterMenuItem();
		});
});

// export this to MenuItem click callback
export default function checkForUpdates(menuItem: MenuItem) {
	updater = menuItem;
	updater.enabled = false;
	void autoUpdater.checkForUpdates().catch((error) => {
		log.error(error);
		if (updater) {
			updater.enabled = true;
			updater = null;
		}
	});
}

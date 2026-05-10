import { AppConfigKeys } from 'model/AppConfig';
import api from 'renderer/Api';
import type { ElectronPlatform } from 'shared/electron-api';
import { PathType } from 'shared/ipc';

function getPlatform(): ElectronPlatform {
	return window.electron.platform;
}

export async function validateSettingsPath(field: string, value: string): Promise<string | undefined> {
	const normalizedValue = value?.trim() || '';
	const platform = getPlatform();

	const result: string | undefined = await api
		.pathExists(normalizedValue, field === AppConfigKeys.GAME_EXEC && platform !== 'darwin' ? PathType.FILE : PathType.DIRECTORY)
		.then((success) => {
			if (!success) {
				return 'Provided path is invalid';
			}
			switch (field) {
				case AppConfigKeys.GAME_EXEC:
					if (normalizedValue.toLowerCase().includes('terratech')) {
						if (platform === 'win32' && !normalizedValue.endsWith('.exe')) {
							return 'Windows executables must end in .exe';
						}
						return undefined;
					}
					return "The TerraTech executable should contain 'TerraTech'";
				case AppConfigKeys.LOCAL_DIR:
					if (!normalizedValue || normalizedValue.toLowerCase().endsWith('localmods')) {
						return undefined;
					}
					return "The local mods directory should end with 'TerraTech/LocalMods'";
				case AppConfigKeys.LOGS_DIR:
					if (normalizedValue.toLowerCase().includes('logs')) {
						return undefined;
					}
					return "The logs directory should contain 'Logs'";
				default:
					return undefined;
			}
		})
		.catch((error) => {
			return error.toString();
		});
	return result;
}

import { Effect } from 'effect';
import { AppConfigKeys } from 'model/AppConfig';
import { RendererElectron, type RendererElectron as RendererElectronService } from 'renderer/runtime';
import { PathType } from 'shared/ipc';

export const validateSettingsPath = Effect.fnUntraced(function* (
	field: string,
	value: string
): Effect.fn.Return<string | undefined, unknown, RendererElectronService> {
	const normalizedValue = value?.trim() || '';
	const renderer = yield* RendererElectron;
	const platform = renderer.electron.platform;

	const success = yield* Effect.tryPromise({
		try: () =>
			renderer.electron.pathExists(
				normalizedValue,
				field === AppConfigKeys.GAME_EXEC && platform !== 'darwin' ? PathType.FILE : PathType.DIRECTORY
			),
		catch: (error) => error
	}).pipe(Effect.catch((error) => Effect.succeed(String(error))));
	if (typeof success === 'string') {
		return success;
	}
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
});

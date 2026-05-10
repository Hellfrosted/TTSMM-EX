import { useEffect, useEffectEvent } from 'react';
import { updateSessionModMetadata, type ModData } from 'model';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

export function useModMetadata(appState: CollectionWorkspaceAppState, onMetadataUpdate: () => void) {
	const handleModMetadataUpdate = useEffectEvent((uid: string, update: Partial<ModData>) => {
		const { mods } = appState;
		const nextMods = updateSessionModMetadata(mods, uid, update, appState.config.userOverrides, {
			treatNuterraSteamBetaAsEquivalent: appState.config.treatNuterraSteamBetaAsEquivalent
		});
		if (!nextMods) {
			return;
		}

		appState.updateState({ mods: nextMods });
		queueMicrotask(() => {
			onMetadataUpdate();
		});
	});

	useEffect(() => {
		return api.onModMetadataUpdate(handleModMetadataUpdate);
	}, []);
}

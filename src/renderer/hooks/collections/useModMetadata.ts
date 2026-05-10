import { useEffect, useEffectEvent } from 'react';
import { cloneSessionMods, setupDescriptors, type ModData } from 'model';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

export function useModMetadata(appState: CollectionWorkspaceAppState, onMetadataUpdate: () => void) {
	const handleModMetadataUpdate = useEffectEvent((uid: string, update: Partial<ModData>) => {
		const { mods } = appState;
		const nextMods = cloneSessionMods(mods);
		const modData = nextMods.foundMods.find((candidate) => candidate.uid === uid);
		if (!modData) {
			return;
		}

		Object.assign(modData, update);
		setupDescriptors(nextMods, appState.config.userOverrides);
		appState.updateState({ mods: nextMods });
		queueMicrotask(() => {
			onMetadataUpdate();
		});
	});

	useEffect(() => {
		return api.onModMetadataUpdate(handleModMetadataUpdate);
	}, []);
}

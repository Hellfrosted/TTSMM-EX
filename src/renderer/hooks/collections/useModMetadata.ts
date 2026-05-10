import { useEffect, useEffectEvent } from 'react';
import { cloneSessionMods, setupDescriptors, type AppState, type ModData } from 'model';
import api from 'renderer/Api';

function isDependencyLookupOnlyUpdate(update: Partial<ModData>) {
	const keys = Object.keys(update);
	return (
		keys.length > 0 &&
		keys.every((key) => key === 'steamDependencies' || key === 'steamDependencyNames')
	);
}

export function useModMetadata(appState: AppState, onMetadataUpdate: () => void) {
	const handleModMetadataUpdate = useEffectEvent((uid: string, update: Partial<ModData>) => {
		const { mods } = appState;
		const nextMods = cloneSessionMods(mods);
		const modData = nextMods.foundMods.find((candidate) => candidate.uid === uid);
		if (!modData) {
			return;
		}

		Object.assign(modData, update);
		setupDescriptors(nextMods, appState.config.userOverrides, appState.config);
		appState.updateState({ mods: nextMods });
		if (!isDependencyLookupOnlyUpdate(update)) {
			queueMicrotask(() => {
				onMetadataUpdate();
			});
		}
	});

	useEffect(() => {
		return api.onModMetadataUpdate(handleModMetadataUpdate);
	}, []);
}

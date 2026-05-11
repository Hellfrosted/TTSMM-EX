import { ModData, ModDataOverride, ModDescriptor } from './Mod';
import {
	cloneModOverride,
	createEmptyModDependencyGraph,
	getModDependencyDescriptor,
	getModDependencyDescriptors,
	getModDependentDescriptors,
	type ModDependencyGraph,
	type ModDependencyGraphOptions,
	setupModDependencyGraph
} from './mod-dependency-graph';

export class SessionMods {
	localPath?: string;

	foundMods: ModData[];

	modIdToModDataMap: Map<string, ModData>;

	dependencyGraph: ModDependencyGraph;

	constructor(localPath: string | undefined, foundMods: ModData[]) {
		this.localPath = localPath;
		this.modIdToModDataMap = new Map();
		this.dependencyGraph = createEmptyModDependencyGraph();
		this.foundMods = foundMods;
	}
}

export function cloneModData(mod: ModData): ModData {
	return {
		...mod,
		authors: mod.authors ? [...mod.authors] : undefined,
		tags: mod.tags ? [...mod.tags] : undefined,
		steamDependencies: mod.steamDependencies ? [...mod.steamDependencies] : undefined,
		steamDependencyNames: mod.steamDependencyNames ? { ...mod.steamDependencyNames } : undefined,
		explicitIDDependencies: mod.explicitIDDependencies ? [...mod.explicitIDDependencies] : undefined,
		overrides: cloneModOverride(mod.overrides)
	};
}

function cloneSessionMods(session: SessionMods): SessionMods {
	return new SessionMods(
		session.localPath,
		session.foundMods.map((mod) => cloneModData(mod))
	);
}

export function hydrateSessionMods(session: SessionMods, overrides: Map<string, ModDataOverride>, options: ModDependencyGraphOptions = {}) {
	setupModDependencyGraph(session, overrides, options);
	return session;
}

export function updateSessionModMetadata(
	session: SessionMods,
	uid: string,
	update: Partial<ModData>,
	overrides: Map<string, ModDataOverride>,
	options: ModDependencyGraphOptions = {}
) {
	const nextSession = cloneSessionMods(session);
	const modData = nextSession.foundMods.find((candidate) => candidate.uid === uid);
	if (!modData) {
		return undefined;
	}

	Object.assign(modData, update);
	return hydrateSessionMods(nextSession, overrides, options);
}

export function getDescriptor(session: SessionMods, mod: ModData): ModDescriptor | undefined {
	return getModDependencyDescriptor(session.dependencyGraph, mod);
}

export function getDependencies(session: SessionMods, mod: ModData): ModDescriptor[] {
	return getModDependencyDescriptors(session.dependencyGraph, mod);
}

export function getDependents(session: SessionMods, mod: ModData): ModDescriptor[] {
	return getModDependentDescriptors(session.dependencyGraph, mod);
}

// This exists because IPC communication means objects must be deserialized from main to renderer
// This means that object refs are not carried over, and so relying on it as a unique ID will fail
export function setupDescriptors(session: SessionMods, overrides: Map<string, ModDataOverride>, options: ModDependencyGraphOptions = {}) {
	hydrateSessionMods(session, overrides, options);
}

export function getByUID(session: SessionMods, uid: string) {
	return session.modIdToModDataMap.get(uid);
}

export function getRows(session: SessionMods): ModData[] {
	return [...session.modIdToModDataMap.values()];
}

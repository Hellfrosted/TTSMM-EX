import { type ModData, type ModDataOverride, type ModDescriptor, ModType, getModDataId, getModDescriptorKey } from './Mod';
import { createModDependencyTargetSatisfactionPolicy, type ModDependencyTargetSatisfactionPolicy } from './mod-dependency-target';
import {
	createNuterraSteamBetaMatchingPolicy,
	type NuterraSteamBetaMatchingPolicy,
	type NuterraSteamCompatibilityOptions
} from './nuterrasteam-compatibility';
import { getSteamDependencyName, getWorkshopDependencySnapshotState } from '../shared/workshop-dependency-snapshot';

interface DependencyGraphSession {
	dependencyGraph: ModDependencyGraph;
	foundMods: ModData[];
	modIdToModDataMap: Map<string, ModData>;
}

export type ModDependencyGraphOptions = NuterraSteamCompatibilityOptions;

export interface ModDependencyGraph {
	dependenciesByDescriptorKey: Map<string, ModDescriptor[]>;
	dependentsByDescriptorKey: Map<string, ModDescriptor[]>;
	descriptorByKey: Map<string, ModDescriptor>;
	descriptorKeyByUid: Map<string, string>;
	modIdToDescriptor: Map<string, ModDescriptor>;
	workshopIdToDescriptor: Map<bigint, ModDescriptor>;
}

interface ModDependencyGraphBuilder extends ModDependencyGraph {
	dependencyKeySetsByDescriptorKey: Map<string, Set<string>>;
	dependentKeySetsByDescriptorKey: Map<string, Set<string>>;
}

export function createEmptyModDependencyGraph(): ModDependencyGraph {
	return {
		dependenciesByDescriptorKey: new Map(),
		dependentsByDescriptorKey: new Map(),
		descriptorByKey: new Map(),
		descriptorKeyByUid: new Map(),
		modIdToDescriptor: new Map(),
		workshopIdToDescriptor: new Map()
	};
}

function createModDependencyGraphBuilder(): ModDependencyGraphBuilder {
	return {
		...createEmptyModDependencyGraph(),
		dependencyKeySetsByDescriptorKey: new Map(),
		dependentKeySetsByDescriptorKey: new Map()
	};
}

export function cloneModOverride(override: ModDataOverride | undefined): ModDataOverride | undefined {
	if (!override) {
		return undefined;
	}

	return {
		...override,
		tags: override.tags ? [...override.tags] : undefined
	};
}

export function getModDependencyDescriptor(graph: ModDependencyGraph, mod: ModData): ModDescriptor | undefined {
	let myDescriptor: ModDescriptor | undefined;
	const id = getModDataId(mod);
	if (id) {
		myDescriptor = graph.modIdToDescriptor.get(id);
	}
	if (!myDescriptor && mod.workshopID) {
		myDescriptor = graph.workshopIdToDescriptor.get(mod.workshopID);
	}
	return myDescriptor;
}

function getRegisteredDescriptorKey(graph: ModDependencyGraph, descriptor: ModDescriptor): string | undefined {
	const descriptorKey = getModDescriptorKey(descriptor);
	return descriptorKey && graph.descriptorByKey.has(descriptorKey) ? descriptorKey : undefined;
}

export function getModDependencyDescriptors(graph: ModDependencyGraph, mod: ModData): ModDescriptor[] {
	const descriptor = getModDependencyDescriptor(graph, mod);
	const descriptorKey = descriptor ? getRegisteredDescriptorKey(graph, descriptor) : undefined;
	return descriptorKey ? (graph.dependenciesByDescriptorKey.get(descriptorKey) ?? []) : [];
}

export function getModDependentDescriptors(graph: ModDependencyGraph, mod: ModData): ModDescriptor[] {
	const descriptor = getModDependencyDescriptor(graph, mod);
	const descriptorKey = descriptor ? getRegisteredDescriptorKey(graph, descriptor) : undefined;
	return descriptorKey ? (graph.dependentsByDescriptorKey.get(descriptorKey) ?? []) : [];
}

function createDescriptor(): ModDescriptor {
	return {
		UIDs: new Set()
	};
}

function registerDescriptor(graph: ModDependencyGraph, descriptor: ModDescriptor) {
	const descriptorKey = getModDescriptorKey(descriptor);
	if (descriptorKey) {
		graph.descriptorByKey.set(descriptorKey, descriptor);
	}
}

function ensureDescriptorForModId(modID: string | undefined | null, graph: ModDependencyGraph, policy: NuterraSteamBetaMatchingPolicy) {
	const normalizedModId = policy.normalizeDependencyId(modID);
	let descriptor = normalizedModId ? graph.modIdToDescriptor.get(normalizedModId) : undefined;
	if (!descriptor && normalizedModId) {
		descriptor = createDescriptor();
		descriptor.modID = normalizedModId;
	}
	if (descriptor) {
		if (normalizedModId && !descriptor.modID) {
			descriptor.modID = normalizedModId;
		}
		if (normalizedModId) {
			graph.modIdToDescriptor.set(normalizedModId, descriptor);
			registerDescriptor(graph, descriptor);
		}
	}
	return descriptor;
}

function ensureDescriptorForEquivalentName(
	name: string | undefined | null,
	graph: ModDependencyGraph,
	policy: NuterraSteamBetaMatchingPolicy
) {
	const normalizedName = policy.normalizeDependencyId(name);
	if (!normalizedName || normalizedName === name) {
		return undefined;
	}

	let descriptor = graph.modIdToDescriptor.get(normalizedName);
	if (!descriptor) {
		descriptor = createDescriptor();
		descriptor.modID = normalizedName;
	}
	if (!descriptor.modID) {
		descriptor.modID = normalizedName;
	}
	graph.modIdToDescriptor.set(normalizedName, descriptor);
	registerDescriptor(graph, descriptor);
	return descriptor;
}

function findExistingDescriptorForModId(
	modID: string | undefined | null,
	graph: ModDependencyGraph,
	policy: NuterraSteamBetaMatchingPolicy
) {
	const normalizedModId = policy.normalizeDependencyId(modID);
	return normalizedModId ? graph.modIdToDescriptor.get(normalizedModId) : undefined;
}

function ensureDescriptorForWorkshopId(workshopID: bigint, graph: ModDependencyGraph) {
	let descriptor = graph.workshopIdToDescriptor.get(workshopID);
	if (!descriptor) {
		descriptor = createDescriptor();
		descriptor.workshopID = workshopID;
		graph.workshopIdToDescriptor.set(workshopID, descriptor);
	}
	if (descriptor.workshopID === undefined) {
		descriptor.workshopID = workshopID;
	}
	registerDescriptor(graph, descriptor);
	return descriptor;
}

function applyWorkshopDescriptors(
	session: DependencyGraphSession,
	overrides: Map<string, ModDataOverride>,
	policy: NuterraSteamBetaMatchingPolicy
) {
	const { dependencyGraph, foundMods, modIdToModDataMap } = session;

	foundMods.forEach((mod: ModData) => {
		const modOverrides = overrides.get(mod.uid);
		mod.overrides = cloneModOverride(modOverrides);

		modIdToModDataMap.set(mod.uid, mod);
		if (mod.type === ModType.WORKSHOP && mod.workshopID) {
			const { workshopID } = mod;
			const id = getModDataId(mod);
			const descriptor =
				ensureDescriptorForModId(id, dependencyGraph, policy) ||
				ensureDescriptorForEquivalentName(mod.name, dependencyGraph, policy) ||
				ensureDescriptorForWorkshopId(workshopID, dependencyGraph);
			descriptor.workshopID = workshopID;
			dependencyGraph.workshopIdToDescriptor.set(workshopID, descriptor);
			registerDescriptor(dependencyGraph, descriptor);

			if (!descriptor.name && mod.name) {
				descriptor.name = mod.name;
			}

			descriptor.UIDs.add(mod.uid);
			const descriptorKey = getRegisteredDescriptorKey(dependencyGraph, descriptor);
			if (descriptorKey) {
				dependencyGraph.descriptorKeyByUid.set(mod.uid, descriptorKey);
			}
		}
	});
}

function applyLocalDescriptors(session: DependencyGraphSession, policy: NuterraSteamBetaMatchingPolicy) {
	const { dependencyGraph, foundMods } = session;

	foundMods.forEach((mod: ModData) => {
		if (mod.type !== ModType.WORKSHOP) {
			const id = getModDataId(mod);
			if (id) {
				const descriptor = ensureDescriptorForModId(id, dependencyGraph, policy);
				if (descriptor) {
					if (!descriptor.name && mod.name) {
						descriptor.name = mod.name;
					}
					descriptor.UIDs.add(mod.uid);
					const descriptorKey = getRegisteredDescriptorKey(dependencyGraph, descriptor);
					if (descriptorKey) {
						dependencyGraph.descriptorKeyByUid.set(mod.uid, descriptorKey);
					}
				}
			}
		}
	});
}

function addDependencyEdge(graph: ModDependencyGraphBuilder, dependentKey: string, dependency: ModDescriptor) {
	const dependencyKey = getRegisteredDescriptorKey(graph, dependency);
	if (!dependencyKey) {
		return;
	}

	let dependencyKeys = graph.dependencyKeySetsByDescriptorKey.get(dependentKey);
	if (!dependencyKeys) {
		dependencyKeys = new Set();
		graph.dependencyKeySetsByDescriptorKey.set(dependentKey, dependencyKeys);
	}
	dependencyKeys.add(dependencyKey);

	let dependentKeys = graph.dependentKeySetsByDescriptorKey.get(dependencyKey);
	if (!dependentKeys) {
		dependentKeys = new Set();
		graph.dependentKeySetsByDescriptorKey.set(dependencyKey, dependentKeys);
	}
	dependentKeys.add(dependentKey);
}

function applyDependencyEdges(
	session: DependencyGraphSession,
	policy: NuterraSteamBetaMatchingPolicy,
	targetPolicy: ModDependencyTargetSatisfactionPolicy
) {
	const graph = session.dependencyGraph as ModDependencyGraphBuilder;
	const { foundMods } = session;

	foundMods.forEach((mod: ModData) => {
		const myDescriptor = getModDependencyDescriptor(graph, mod);
		const myDescriptorKey = myDescriptor ? getRegisteredDescriptorKey(graph, myDescriptor) : undefined;
		if (myDescriptorKey) {
			const workshopDependencySnapshotState = getWorkshopDependencySnapshotState(mod);
			const steamDependencies = workshopDependencySnapshotState.hasKnownSnapshot ? (mod.steamDependencies ?? []) : [];
			steamDependencies.forEach((workshopID) => {
				const dependencyName = getSteamDependencyName(mod.steamDependencyNames, workshopID);
				const equivalentDependencyId = targetPolicy.getEquivalentDependencyIdForTarget({
					workshopID,
					name: dependencyName
				});
				const equivalentDescriptorId = targetPolicy.getEquivalentDescriptorIdForTarget({
					workshopID,
					name: dependencyName
				});
				const descriptor =
					graph.workshopIdToDescriptor.get(workshopID) ||
					findExistingDescriptorForModId(equivalentDependencyId, graph, policy) ||
					(equivalentDescriptorId ? ensureDescriptorForModId(equivalentDescriptorId, graph, policy) : undefined) ||
					ensureDescriptorForWorkshopId(workshopID, graph);
				graph.workshopIdToDescriptor.set(workshopID, descriptor);
				registerDescriptor(graph, descriptor);
				if (dependencyName && !descriptor.name) {
					descriptor.name = dependencyName;
				}
				addDependencyEdge(graph, myDescriptorKey, descriptor);
			});
			mod.explicitIDDependencies?.forEach((modID) => {
				const descriptor = ensureDescriptorForModId(modID, graph, policy);
				if (descriptor) {
					if (!descriptor.name) {
						descriptor.name = modID;
					}
					addDependencyEdge(graph, myDescriptorKey, descriptor);
				}
			});
		}
	});
}

function finalizeDependencyEdges(graph: ModDependencyGraphBuilder) {
	graph.dependencyKeySetsByDescriptorKey.forEach((dependencyKeys, descriptorKey) => {
		graph.dependenciesByDescriptorKey.set(
			descriptorKey,
			Array.from(dependencyKeys).flatMap((dependencyKey) => {
				const descriptor = graph.descriptorByKey.get(dependencyKey);
				return descriptor ? [descriptor] : [];
			})
		);
	});
	graph.dependentKeySetsByDescriptorKey.forEach((dependentKeys, descriptorKey) => {
		graph.dependentsByDescriptorKey.set(
			descriptorKey,
			Array.from(dependentKeys).flatMap((dependentKey) => {
				const descriptor = graph.descriptorByKey.get(dependentKey);
				return descriptor ? [descriptor] : [];
			})
		);
	});
}

export function setupModDependencyGraph(
	session: DependencyGraphSession,
	overrides: Map<string, ModDataOverride>,
	options: ModDependencyGraphOptions = {}
) {
	const { modIdToModDataMap } = session;
	const policy = createNuterraSteamBetaMatchingPolicy(options);
	const targetPolicy = createModDependencyTargetSatisfactionPolicy(options);
	modIdToModDataMap.clear();
	session.dependencyGraph = createModDependencyGraphBuilder();

	applyWorkshopDescriptors(session, overrides, policy);
	applyLocalDescriptors(session, policy);
	applyDependencyEdges(session, policy, targetPolicy);
	finalizeDependencyEdges(session.dependencyGraph as ModDependencyGraphBuilder);
}

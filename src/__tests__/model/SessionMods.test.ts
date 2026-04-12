import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { ModType } from '../../model/Mod';
import { SessionMods, getDescriptor, setupDescriptors, validateCollection } from '../../model/SessionMods';

describe('session mod descriptors', () => {
	it('treats NuterraSteam and NuterraSteam(beta) as the same dependency target when enabled', () => {
		const dependency = {
			uid: `${ModType.WORKSHOP}:1`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'NuterraSteam(beta)',
			name: 'NuterraSteam(beta)'
		};
		const dependent = {
			uid: `${ModType.LOCAL}:dependent-mod`,
			type: ModType.LOCAL,
			id: 'DependentMod',
			explicitIDDependencies: ['NuterraSteam']
		};
		const session = new SessionMods('', [dependency, dependent]);

		setupDescriptors(session, new Map(), {
			...DEFAULT_CONFIG,
			treatNuterraSteamBetaAsEquivalent: true
		});

		const dependencyDescriptor = getDescriptor(session, dependency);
		expect(dependencyDescriptor).toBeDefined();
		expect(dependent.dependsOn).toEqual([dependencyDescriptor]);
		expect(dependency.isDependencyFor).toEqual([getDescriptor(session, dependent)]);
	});

	it('treats NuterraSteam and NuterraSteam (Beta) as the same dependency target when enabled', () => {
		const dependency = {
			uid: `${ModType.WORKSHOP}:1`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'NuterraSteam',
			name: 'NuterraSteam'
		};
		const dependent = {
			uid: `${ModType.LOCAL}:dependent-mod`,
			type: ModType.LOCAL,
			id: 'DependentMod',
			explicitIDDependencies: ['NuterraSteam (Beta)']
		};
		const session = new SessionMods('', [dependency, dependent]);

		setupDescriptors(session, new Map(), {
			...DEFAULT_CONFIG,
			treatNuterraSteamBetaAsEquivalent: true
		});

		const dependencyDescriptor = getDescriptor(session, dependency);
		expect(dependencyDescriptor).toBeDefined();
		expect(dependent.dependsOn).toEqual([dependencyDescriptor]);
		expect(dependency.isDependencyFor).toEqual([getDescriptor(session, dependent)]);
	});

	it('matches workshop dependency names for Nuterra variants when enabled', async () => {
		const dependency = {
			uid: `${ModType.WORKSHOP}:1`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'NuterraSteam',
			name: 'NuterraSteam'
		};
		const dependent = {
			uid: `${ModType.WORKSHOP}:10`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(10),
			id: 'DependentWorkshopMod',
			name: 'Dependent Workshop Mod',
			steamDependencies: [BigInt(2790966966)],
			steamDependencyNames: {
				'2790966966': 'NuterraSteam (Beta)'
			}
		};
		const session = new SessionMods('', [dependency, dependent]);

		setupDescriptors(session, new Map(), {
			...DEFAULT_CONFIG,
			treatNuterraSteamBetaAsEquivalent: true
		});

		const dependencyDescriptor = getDescriptor(session, dependency);
		expect(dependent.dependsOn).toEqual([dependencyDescriptor]);

		const errors = await validateCollection(session, {
			name: 'default',
			mods: [dependency.uid, dependent.uid]
		});

		expect(errors[dependent.uid]?.missingDependencies).toBeUndefined();
		expect(dependency.isDependencyFor).toEqual([getDescriptor(session, dependent)]);
	});

	it('treats a loaded name-only Nuterra beta workshop item as equivalent when the stable variant is selected', async () => {
		const stableDependency = {
			uid: `${ModType.WORKSHOP}:2484820102`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(2484820102),
			id: 'NuterraSteam',
			name: 'NuterraSteam'
		};
		const betaDependency = {
			uid: `${ModType.WORKSHOP}:2790966966`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(2790966966),
			id: null,
			name: 'NuterraSteam (Beta)'
		};
		const dependent = {
			uid: `${ModType.WORKSHOP}:10`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(10),
			id: 'DependentWorkshopMod',
			name: 'Dependent Workshop Mod',
			steamDependencies: [BigInt(2790966966)],
			steamDependencyNames: {
				'2790966966': 'NuterraSteam (Beta)'
			}
		};
		const session = new SessionMods('', [stableDependency, betaDependency, dependent]);

		setupDescriptors(session, new Map(), {
			...DEFAULT_CONFIG,
			treatNuterraSteamBetaAsEquivalent: true
		});

		expect(dependent.dependsOn).toEqual([getDescriptor(session, stableDependency)]);

		const errors = await validateCollection(session, {
			name: 'default',
			mods: [stableDependency.uid, dependent.uid]
		});

		expect(errors[dependent.uid]?.missingDependencies).toBeUndefined();
	});

	it('reports missing explicit ID dependencies that are not loaded', async () => {
		const dependent = {
			uid: `${ModType.LOCAL}:dependent-mod`,
			type: ModType.LOCAL,
			id: 'DependentMod',
			name: 'Dependent Mod',
			explicitIDDependencies: ['MissingMod']
		};
		const session = new SessionMods('', [dependent]);

		setupDescriptors(session, new Map(), DEFAULT_CONFIG);

		const errors = await validateCollection(session, {
			name: 'default',
			mods: [dependent.uid]
		});

		expect(dependent.dependsOn).toHaveLength(1);
		expect(dependent.dependsOn?.[0]).toMatchObject({ modID: 'MissingMod', name: 'MissingMod' });
		expect(errors[dependent.uid]?.missingDependencies).toHaveLength(1);
		expect(errors[dependent.uid]?.missingDependencies?.[0]).toMatchObject({ modID: 'MissingMod' });
	});

	it('reports missing workshop dependencies that are not loaded', async () => {
		const dependent = {
			uid: `${ModType.WORKSHOP}:10`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(10),
			id: 'DependentWorkshopMod',
			name: 'Dependent Workshop Mod',
			steamDependencies: [BigInt(11)]
		};
		const session = new SessionMods('', [dependent]);

		setupDescriptors(session, new Map(), DEFAULT_CONFIG);

		const errors = await validateCollection(session, {
			name: 'default',
			mods: [dependent.uid]
		});

		expect(dependent.dependsOn).toHaveLength(1);
		expect(dependent.dependsOn?.[0]).toMatchObject({ workshopID: BigInt(11) });
		expect(errors[dependent.uid]?.missingDependencies).toHaveLength(1);
		expect(errors[dependent.uid]?.missingDependencies?.[0]).toMatchObject({ workshopID: BigInt(11) });
	});

	it('uses workshop dependency names for unresolved workshop dependencies', () => {
		const dependent = {
			uid: `${ModType.WORKSHOP}:10`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(10),
			id: 'DependentWorkshopMod',
			name: 'Dependent Workshop Mod',
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			}
		};
		const session = new SessionMods('', [dependent]);

		setupDescriptors(session, new Map(), DEFAULT_CONFIG);

		expect(dependent.dependsOn).toHaveLength(1);
		expect(dependent.dependsOn?.[0]).toMatchObject({
			workshopID: BigInt(11),
			name: 'Harmony (2.2.2)'
		});
	});
});

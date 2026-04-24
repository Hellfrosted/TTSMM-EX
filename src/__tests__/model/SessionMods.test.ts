import { describe, expect, it } from 'vitest';
import { ModType } from '../../model/Mod';
import { SessionMods, filterRows, getDescriptor, setupDescriptors, validateCollection } from '../../model/SessionMods';

describe('session mod descriptors', () => {
	it.each([
		{
			dependencyId: 'NuterraSteam(beta)',
			dependencyName: 'NuterraSteam(beta)',
			explicitDependency: 'NuterraSteam'
		},
		{
			dependencyId: 'NuterraSteam',
			dependencyName: 'NuterraSteam',
			explicitDependency: 'NuterraSteam (Beta)'
		}
	])('treats $dependencyName and $explicitDependency as the same dependency target', ({ dependencyId, dependencyName, explicitDependency }) => {
		const dependency = {
			uid: `${ModType.WORKSHOP}:1`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: dependencyId,
			name: dependencyName
		};
		const dependent = {
			uid: `${ModType.LOCAL}:dependent-mod`,
			type: ModType.LOCAL,
			id: 'DependentMod',
			explicitIDDependencies: [explicitDependency]
		};
		const session = new SessionMods('', [dependency, dependent]);

		setupDescriptors(session, new Map());

		const dependencyDescriptor = getDescriptor(session, dependency);
		expect(dependencyDescriptor).toBeDefined();
		expect(dependent.dependsOn).toEqual([dependencyDescriptor]);
		expect(dependency.isDependencyFor).toEqual([getDescriptor(session, dependent)]);
	});

	it('matches workshop dependency names for Nuterra variants', async () => {
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

		setupDescriptors(session, new Map());

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

		setupDescriptors(session, new Map());

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

		setupDescriptors(session, new Map());

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

		setupDescriptors(session, new Map());

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

		setupDescriptors(session, new Map());

		expect(dependent.dependsOn).toHaveLength(1);
		expect(dependent.dependsOn?.[0]).toMatchObject({
			workshopID: BigInt(11),
			name: 'Harmony (2.2.2)'
		});
	});

	it('matches the displayed mod id when filtering rows', () => {
		const versionedWorkshopMod = {
			uid: `${ModType.WORKSHOP}:42`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(42),
			id: 'OmodManager',
			name: 'OmodManager v1.6.1.1'
		};
		const session = new SessionMods('', [versionedWorkshopMod]);
		setupDescriptors(session, new Map());

		expect(filterRows(session, 'omodmanager')).toEqual([versionedWorkshopMod]);
	});

	it('clears stale overrides when a user override is removed', () => {
		const mod = {
			uid: `${ModType.LOCAL}:override-target`,
			type: ModType.LOCAL,
			id: 'OriginalModId',
			name: 'Override Target'
		};
		const session = new SessionMods('', [mod]);

		setupDescriptors(
			session,
			new Map([
				[
					mod.uid,
					{
						id: 'OverrideModId',
						tags: ['utility']
					}
				]
			])
		);
		expect(mod.overrides).toEqual({
			id: 'OverrideModId',
			tags: ['utility']
		});

		setupDescriptors(session, new Map());

		expect(mod.overrides).toBeUndefined();
	});

	it('flags duplicate UID selections in a collection as conflicts', async () => {
		const mod = {
			uid: `${ModType.LOCAL}:duplicate-mod`,
			type: ModType.LOCAL,
			id: 'DuplicateMod',
			name: 'Duplicate Mod'
		};
		const session = new SessionMods('', [mod]);

		setupDescriptors(session, new Map());

		const errors = await validateCollection(session, {
			name: 'default',
			mods: [mod.uid, mod.uid]
		});

		expect(errors[mod.uid]?.incompatibleMods).toEqual([mod.uid]);
	});
});

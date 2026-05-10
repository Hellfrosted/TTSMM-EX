import { describe, expect, it } from 'vitest';
import { createModDependencyProjection, ModType, SessionMods, setupDescriptors } from '../../model';

describe('mod dependency projection', () => {
	it('projects unresolved dependency descriptors for display', () => {
		const dependent = {
			uid: `${ModType.LOCAL}:dependent-mod`,
			type: ModType.LOCAL,
			id: 'DependentMod',
			name: 'Dependent Mod',
			explicitIDDependencies: ['MissingMod']
		};
		const session = new SessionMods('', [dependent]);
		setupDescriptors(session, new Map());

		const projection = createModDependencyProjection(session, dependent);

		expect(projection.requiredModData).toEqual([
			{
				uid: `${ModType.DESCRIPTOR}:MissingMod`,
				id: 'MissingMod',
				workshopID: undefined,
				type: ModType.DESCRIPTOR,
				name: 'MissingMod'
			}
		]);
		expect(projection.dependentModData).toEqual([]);
		expect(projection.conflictingModData).toEqual([]);
	});

	it('projects dependency groups and conflicts from descriptor ownership', () => {
		const dependency = {
			uid: `${ModType.LOCAL}:dependency`,
			type: ModType.LOCAL,
			id: 'SharedMod',
			name: 'Shared Mod'
		};
		const duplicateDependency = {
			uid: `${ModType.WORKSHOP}:100`,
			type: ModType.WORKSHOP,
			workshopID: BigInt(100),
			id: 'SharedMod',
			name: 'Shared Mod Workshop'
		};
		const dependent = {
			uid: `${ModType.LOCAL}:dependent`,
			type: ModType.LOCAL,
			id: 'DependentMod',
			name: 'Dependent Mod',
			explicitIDDependencies: ['SharedMod']
		};
		const session = new SessionMods('', [dependency, duplicateDependency, dependent]);
		setupDescriptors(session, new Map());

		const dependencyProjection = createModDependencyProjection(session, dependency);
		const dependentProjection = createModDependencyProjection(session, dependent);

		expect(dependencyProjection.conflictingModData).toEqual([duplicateDependency]);
		expect(dependencyProjection.dependentModData).toEqual([
			expect.objectContaining({
				uid: dependent.uid,
				type: ModType.DESCRIPTOR
			})
		]);
		expect(dependentProjection.requiredModData).toHaveLength(1);
		expect(dependentProjection.requiredModData[0]).toEqual(
			expect.objectContaining({
				uid: `${ModType.DESCRIPTOR}:SharedMod`,
				type: ModType.DESCRIPTOR,
				children: expect.arrayContaining([dependency, duplicateDependency])
			})
		);
	});
});

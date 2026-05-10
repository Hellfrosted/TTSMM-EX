import { describe, expect, it } from 'vitest';
import { ModType } from '../../model';
import { createModDependencyTargetSatisfactionPolicy } from '../../model/mod-dependency-target';

describe('mod dependency target satisfaction', () => {
	it('satisfies dependency targets by Workshop ID, Workshop Dependency Name, and NuterraSteam Beta Matching policy', () => {
		const policy = createModDependencyTargetSatisfactionPolicy({
			treatNuterraSteamBetaAsEquivalent: true
		});

		expect(
			policy.isDependencyTargetSatisfiedByMod(
				{ workshopID: BigInt(11), name: 'Harmony (2.2.2)' },
				{
					uid: 'workshop:11',
					type: ModType.WORKSHOP,
					workshopID: BigInt(11),
					id: 'OtherId',
					name: 'Other Name'
				}
			)
		).toBe(true);

		expect(
			policy.isDependencyTargetSatisfiedByMod(
				{ workshopID: BigInt(12), name: 'Harmony (2.2.2)' },
				{
					uid: 'local:harmony',
					type: ModType.LOCAL,
					id: 'Harmony (2.2.2)',
					name: 'Harmony Local'
				}
			)
		).toBe(true);

		expect(
			policy.isDependencyTargetSatisfiedByMod(
				{ workshopID: BigInt(2790966966), name: 'NuterraSteam (Beta)' },
				{
					uid: 'workshop:2484820102',
					type: ModType.WORKSHOP,
					workshopID: BigInt(2484820102),
					id: 'NuterraSteam',
					name: 'NuterraSteam'
				}
			)
		).toBe(true);
	});

	it('keeps NuterraSteam Beta Matching policy explicit', () => {
		const policy = createModDependencyTargetSatisfactionPolicy({
			treatNuterraSteamBetaAsEquivalent: false
		});

		expect(
			policy.isDependencyTargetSatisfiedByMod(
				{ workshopID: BigInt(2790966966), name: 'NuterraSteam (Beta)' },
				{
					uid: 'workshop:2484820102',
					type: ModType.WORKSHOP,
					workshopID: BigInt(2484820102),
					id: 'NuterraSteam',
					name: 'NuterraSteam'
				}
			)
		).toBe(false);
	});
});

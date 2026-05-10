import { describe, expect, it } from 'vitest';
import { ModType } from '../../model/Mod';
import {
	createNuterraSteamBetaMatchingPolicy,
	NUTERRASTEAM_BETA_WORKSHOP_ID,
	NUTERRASTEAM_CANONICAL_MOD_ID
} from '../../model/nuterrasteam-compatibility';
import { createModDependencyTargetSatisfactionPolicy } from '../../model/mod-dependency-target';

describe('NuterraSteam Beta Matching policy', () => {
	it('defaults compatibility on and normalizes Nuterra variant dependency IDs', () => {
		const policy = createNuterraSteamBetaMatchingPolicy();

		expect(policy.enabled).toBe(true);
		expect(policy.normalizeDependencyId('NuterraSteam (Beta)')).toBe(NUTERRASTEAM_CANONICAL_MOD_ID);
		expect(policy.normalizeDependencyId('NuterraSteam')).toBe(NUTERRASTEAM_CANONICAL_MOD_ID);
		expect(policy.normalizeDependencyId('Other Mod')).toBe('Other Mod');
	});

	it('preserves exact stable-versus-beta text matching when compatibility is disabled', () => {
		const policy = createNuterraSteamBetaMatchingPolicy({ treatNuterraSteamBetaAsEquivalent: false });

		expect(policy.enabled).toBe(false);
		expect(policy.normalizeDependencyId('NuterraSteam (Beta)')).toBe('NuterraSteam (Beta)');
		expect(policy.areDependencyTextsEquivalent('NuterraSteam', 'NuterraSteam (Beta)')).toBe(false);
		expect(policy.areDependencyTextsEquivalent('NuterraSteam', 'NuterraSteam')).toBe(true);
	});

	it('matches stable and beta Nuterra text variants when compatibility is enabled', () => {
		const policy = createNuterraSteamBetaMatchingPolicy({ treatNuterraSteamBetaAsEquivalent: true });

		expect(policy.areDependencyTextsEquivalent('NuterraSteam', 'NuterraSteam (Beta)')).toBe(true);
		expect(policy.areDependencyTextsEquivalent('NuterraSteam(beta)', 'NuterraSteam')).toBe(true);
		expect(policy.areDependencyTextsEquivalent('NuterraSteam', 'Other Mod')).toBe(false);
	});

	it('matches Workshop Dependency Names against loaded Nuterra variants', () => {
		const policy = createModDependencyTargetSatisfactionPolicy();
		const stableMod = {
			uid: 'workshop:2484820102',
			type: ModType.WORKSHOP,
			workshopID: BigInt(2484820102),
			id: 'NuterraSteam',
			name: 'NuterraSteam'
		};

		expect(policy.isDependencyTargetSatisfiedByMod({ name: 'NuterraSteam (Beta)' }, stableMod)).toBe(true);
	});

	it('satisfies explicit dependency names against loaded mod identity text', () => {
		const policy = createModDependencyTargetSatisfactionPolicy();
		const sameNamedMod = {
			uid: 'workshop:22',
			type: ModType.WORKSHOP,
			workshopID: BigInt(22),
			id: 'Shared Dependency',
			name: 'Shared Dependency'
		};

		expect(policy.isDependencyTargetSatisfiedByMod({ name: 'Shared Dependency' }, sameNamedMod)).toBe(true);
	});

	it('matches the raw Nuterra beta Workshop dependency ID against loaded Nuterra variants only when enabled', () => {
		const stableMod = {
			uid: 'workshop:2484820102',
			type: ModType.WORKSHOP,
			workshopID: BigInt(2484820102),
			id: 'NuterraSteam',
			name: 'NuterraSteam'
		};

		expect(createModDependencyTargetSatisfactionPolicy().isDependencyTargetSatisfiedByMod({ workshopID: NUTERRASTEAM_BETA_WORKSHOP_ID }, stableMod)).toBe(
			true
		);
		expect(
			createModDependencyTargetSatisfactionPolicy({ treatNuterraSteamBetaAsEquivalent: false }).isDependencyTargetSatisfiedByMod(
				{ workshopID: NUTERRASTEAM_BETA_WORKSHOP_ID },
				stableMod
			)
		).toBe(false);
	});
});

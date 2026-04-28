import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionManagerModalType, ModErrorType } from '../../model';
import { useCollectionWorkspaceSession } from '../../renderer/hooks/collections/useCollectionWorkspaceSession';

function renderSession(overrides: Partial<Parameters<typeof useCollectionWorkspaceSession>[0]> = {}) {
	return renderHook(() =>
		useCollectionWorkspaceSession({
			dirtyDraft: {
				hasChanges: false,
				collection: undefined
			},
			savingCollection: false,
			validationIsCurrent: true,
			validationStatus: undefined,
			validationResult: undefined,
			validatingMods: false,
			loadingMods: false,
			launchingGame: false,
			modalType: CollectionManagerModalType.NONE,
			gameRunning: false,
			overrideGameRunning: false,
			...overrides
		})
	);
}

describe('useCollectionWorkspaceSession', () => {
	it('exposes dirty draft, save, validation, and launch readiness state', () => {
		const collection = { name: 'default', mods: ['local:mod-a'] };
		const validationResult = {
			[ModErrorType.MISSING_DEPENDENCIES]: {
				'local:mod-a': ['Dependency']
			}
		};

		const { result } = renderSession({
			dirtyDraft: {
				hasChanges: true,
				collection
			},
			savingCollection: true,
			validationStatus: false,
			validationResult,
			validatingMods: true
		});

		expect(result.current.dirtyDraft).toEqual({
			hasChanges: true,
			collection
		});
		expect(result.current.saveProgress.savingCollection).toBe(true);
		expect(result.current.validationProgress.validatingMods).toBe(true);
		expect(result.current.validationStatus).toBe(false);
		expect(result.current.validationResult).toBe(validationResult);
		expect(result.current.launchReadiness.canLaunchValidatedDraft).toBe(false);
	});

	it('only reports launch-ready validation when the clean draft has current passing validation', () => {
		const { result } = renderSession({
			validationStatus: true
		});

		expect(result.current.launchReadiness.canLaunchValidatedDraft).toBe(true);

		const { result: dirtyResult } = renderSession({
			dirtyDraft: {
				hasChanges: true,
				collection: { name: 'default', mods: [] }
			},
			validationStatus: true
		});

		expect(dirtyResult.current.launchReadiness.canLaunchValidatedDraft).toBe(false);
	});

	it('hides stale validation results from consumers', () => {
		const validationResult = {
			[ModErrorType.MISSING_DEPENDENCIES]: {
				'local:mod-a': ['Dependency']
			}
		};

		const { result } = renderSession({
			validationIsCurrent: false,
			validationStatus: false,
			validationResult
		});

		expect(result.current.validationStatus).toBeUndefined();
		expect(result.current.validationResult).toBeUndefined();
	});

	it('marks launch unavailable when blockers are present', () => {
		const { result } = renderSession({
			loadingMods: true,
			gameRunning: true
		});

		expect(result.current.launchReadiness.disabled).toBe(true);
	});
});

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionManagerModalType, ModErrorType } from '../../model';
import { useCollectionWorkspaceSession } from '../../renderer/hooks/collections/useCollectionWorkspaceSession';

function renderWorkspaceSession(overrides: Partial<Parameters<typeof useCollectionWorkspaceSession>[0]> = {}) {
	return renderHook(() =>
		useCollectionWorkspaceSession({
			dirtyDraft: {
				hasChanges: false,
				collection: { name: 'default', mods: ['local:clean'] }
			},
			savingCollection: false,
			validationIsCurrent: true,
			validationStatus: true,
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

describe('Night Watch QA: collection workspace session', () => {
	it('does not launch from stale passing validation after the workspace draft changes', () => {
		const staleErrors = {
			[ModErrorType.MISSING_DEPENDENCIES]: {
				'local:dirty': ['local:dependency']
			}
		};

		const { result } = renderWorkspaceSession({
			dirtyDraft: {
				hasChanges: true,
				collection: { name: 'default', mods: ['local:dirty'] }
			},
			validationIsCurrent: false,
			validationStatus: true,
			validationResult: staleErrors
		});

		expect(result.current.validationStatus).toBeUndefined();
		expect(result.current.validationResult).toBeUndefined();
		expect(result.current.launchReadiness.canLaunchValidatedDraft).toBe(false);
	});

	it('keeps launch disabled while collection workspace blockers are active', () => {
		const { result } = renderWorkspaceSession({
			loadingMods: true,
			launchingGame: true,
			modalType: CollectionManagerModalType.CREATE,
			gameRunning: true,
			overrideGameRunning: true
		});

		expect(result.current.launchReadiness).toEqual({
			disabled: true,
			launchingGame: true,
			canLaunchValidatedDraft: true
		});
	});
});

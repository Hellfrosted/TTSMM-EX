import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useCollectionValidation } from '../../renderer/hooks/collections/useCollectionValidation';
import { createAppState } from './test-utils';

describe('useCollectionValidation', () => {
	it('does not treat a previous validation result as current after switching collections', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true),
				launchMods: vi.fn(async () => undefined)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(true);

		act(() => {
			appState.activeCollection = { name: 'alt', mods: ['local:b'] };
		});
		rerender();

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(false);
	});
});

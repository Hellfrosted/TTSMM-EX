import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEffectAtomRendererProof } from '../../renderer/effect-atom-renderer-proof';

describe('effect atom renderer proof', () => {
	it('renders and updates an Effect Atom from React', () => {
		const { result } = renderHook(() => useEffectAtomRendererProof());

		expect(result.current.count).toBe(0);

		act(() => {
			result.current.setCount(3);
		});

		expect(result.current.count).toBe(3);
	});
});

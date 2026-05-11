import { useAtomRef } from '@effect/atom-react';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';

const rendererProofCountRef = AtomRef.make(0);

export function useEffectAtomRendererProof() {
	const count = useAtomRef(rendererProofCountRef);
	return {
		count,
		setCount: (nextCount: number) => {
			rendererProofCountRef.set(nextCount);
		}
	};
}

export function EffectAtomRendererProof() {
	useEffectAtomRendererProof();
	return null;
}

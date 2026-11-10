import { useCallback, useState } from 'react';

export function useCacheMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, onSuccess?: (result: TResult) => void) {
	const [pendingCount, setPendingCount] = useState(0);
	const mutateAsync = useCallback(
		async (input: TInput) => {
			setPendingCount((count) => count + 1);
			try {
				const result = await mutationFn(input);
				onSuccess?.(result);
				return result;
			} finally {
				setPendingCount((count) => count - 1);
			}
		},
		[mutationFn, onSuccess]
	);
	return { isPending: pendingCount > 0, mutateAsync };
}

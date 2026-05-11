import { useCallback, useState } from 'react';

export function useCacheMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, onSuccess?: (result: TResult) => void) {
	const [isMutating, setIsMutating] = useState(false);
	const mutateAsync = useCallback(
		async (input: TInput) => {
			setIsMutating(true);
			try {
				const result = await mutationFn(input);
				onSuccess?.(result);
				return result;
			} finally {
				setIsMutating(false);
			}
		},
		[mutationFn, onSuccess]
	);
	return { isPending: isMutating, mutateAsync };
}

export interface CancellablePromise<Type> {
	promise: Promise<Type>;
	cancel: () => void;
}

export function cancellablePromise<Type>(promise: Promise<Type>): CancellablePromise<Type> {
	const isCancelled = { value: false };
	const wrappedPromise: Promise<Type> = new Promise((resolve, reject) => {
		promise
			.then((d) => {
				return isCancelled.value ? reject({ cancelled: true }) : resolve(d);
			})
			.catch((e) => {
				reject({
					cancelled: isCancelled.value,
					error: e
				});
			});
	});

	return {
		promise: wrappedPromise,
		cancel: () => {
			isCancelled.value = true;
		}
	};
}

export function isSuccessful<T>(response: PromiseSettledResult<T>): response is PromiseFulfilledResult<T> {
	return 'value' in response;
}

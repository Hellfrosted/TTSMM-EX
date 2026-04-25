export const pause = <Args extends unknown[], Result>(
	ms: number,
	callback: (...args: Args) => Result | Promise<Result>,
	...args: Args
): Promise<Awaited<Result>> => {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			void Promise.resolve(callback(...args))
				.then(resolve)
				.catch(reject);
		}, ms);
	});
};

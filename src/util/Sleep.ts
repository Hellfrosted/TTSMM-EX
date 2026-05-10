const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const pause = <Args extends unknown[], Result>(
	ms: number,
	callback: (...args: Args) => Result | Promise<Result>,
	...args: Args
): Promise<Awaited<Result>> => {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			void Promise.resolve(callback(...args)).then(resolve).catch(reject);
		}, ms);
	});
};

async function sleep(ms: number) {
	await delay(ms);
}

export interface ForEachProps<Type> {
	value: Type;
	index: number;
	array: Type[];
}

function delayForEach<Type, Args extends unknown[]>(
	array: Type[],
	delayTime: number,
	func: (props: ForEachProps<Type>, ...funcArgs: Args) => void,
	...args: Args
): Promise<void> {
	let promise = Promise.resolve();
	let index = 0;
	while (index < array.length) {
		const fixInd = index;
		promise = promise.then(() => {
			return new Promise<void>((resolve) => {
				setTimeout(() => {
					func(
						{
							value: array[fixInd],
							index: fixInd,
							array
						},
						...args
					);
					resolve();
				}, delayTime);
			});
		});
		index += 1;
	}
	return promise;
}

export { sleep, pause, delayForEach };

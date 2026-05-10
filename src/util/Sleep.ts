import { Effect } from 'effect';

export const pauseEffect = Effect.fnUntraced(function* <Args extends unknown[], Result>(
	ms: number,
	callback: (...args: Args) => Result | Promise<Result>,
	...args: Args
) {
	yield* Effect.sleep(ms);
	return yield* Effect.tryPromise({
		try: () => Promise.resolve(callback(...args)),
		catch: (error) => error
	});
});

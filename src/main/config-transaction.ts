import path from 'path';

const pendingTransactions = new Map<string, Promise<void>>();

export function runConfigTransaction<T>(userDataPath: string, operation: () => Promise<T>): Promise<T> {
	const key = path.resolve(userDataPath);
	const previous = pendingTransactions.get(key) ?? Promise.resolve();
	const result = previous.then(operation);
	const settled = result.then(
		() => undefined,
		() => undefined
	);
	pendingTransactions.set(key, settled);
	void settled.then(() => {
		if (pendingTransactions.get(key) === settled) pendingTransactions.delete(key);
	});
	return result;
}

import { cloneCollection, type ModCollection, type NotificationProps } from 'model';
import { Effect, Semaphore } from 'effect';
import type { CollectionContentSaveResult } from 'shared/collection-content-save';
import type { NotificationType } from './hooks/collections/useNotifications';
import type { CollectionContentSaveCompletion } from './collection-workspace-session';

interface CollectionContentSaveLogger {
	error: (message?: unknown, ...optionalParams: unknown[]) => void;
}

interface CollectionContentSaveNotification {
	props: NotificationProps;
	type: NotificationType;
}

interface CollectionContentSaveOutcome {
	completion: CollectionContentSaveCompletion;
	notification?: CollectionContentSaveNotification;
	result: CollectionContentSaveResult;
	targetCollection: ModCollection;
	writeAccepted: boolean;
}

interface CollectionContentSaveInput {
	collection: ModCollection;
	logger: CollectionContentSaveLogger;
	persistCollectionFile: (collection: ModCollection) => Effect.Effect<CollectionContentSaveResult, unknown>;
	pureSave: boolean;
	showSuccessNotification?: boolean;
}

interface CollectionWriteQueue {
	runEffect: <A, E, R>(operation: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
	run: <T>(operation: () => Promise<T>) => Promise<T>;
}

export function createCollectionWriteQueue(): CollectionWriteQueue {
	const semaphore = Semaphore.makeUnsafe(1);

	return {
		runEffect<A, E, R>(operation: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
			return Semaphore.withPermit(semaphore, operation);
		},
		async run<T>(operation: () => Promise<T>): Promise<T> {
			return await Effect.runPromise(
				Semaphore.withPermit(
					semaphore,
					Effect.tryPromise({
						try: operation,
						catch: (error) => error
					})
				)
			);
		}
	};
}

export const runCollectionContentSave = Effect.fnUntraced(function* (
	input: CollectionContentSaveInput
): Effect.fn.Return<CollectionContentSaveOutcome> {
	const targetCollection = cloneCollection(input.collection);
	let result: CollectionContentSaveResult = {
		ok: false,
		code: 'write-failed',
		message: `Failed to save collection ${targetCollection.name}`
	};

	result = yield* input.persistCollectionFile(targetCollection).pipe(
		Effect.catch((error) => {
			input.logger.error(error);
			return Effect.succeed(result);
		})
	);
	const writeAccepted = result.ok;
	const savedCollection = result.ok ? result.collection : targetCollection;

	const notification: CollectionContentSaveNotification | undefined = writeAccepted
		? input.showSuccessNotification
			? {
					props: {
						message: `Saved collection ${savedCollection.name}`,
						placement: 'bottomRight',
						duration: 1
					},
					type: 'success' as const
				}
			: undefined
		: {
				props: {
					message: result.message,
					placement: 'bottomRight',
					duration: null
				},
				type: 'error' as const
			};

	return {
		completion: {
			pureSave: input.pureSave,
			writeAccepted
		},
		notification,
		result,
		targetCollection: savedCollection,
		writeAccepted
	};
});

import { cloneCollection, type ModCollection, type NotificationProps } from 'model';
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
	persistCollectionFile: (collection: ModCollection) => Promise<CollectionContentSaveResult>;
	pureSave: boolean;
	showSuccessNotification?: boolean;
}

interface CollectionWriteQueue {
	run: <T>(operation: () => Promise<T>) => Promise<T>;
}

export function createCollectionWriteQueue(): CollectionWriteQueue {
	let currentOperation: Promise<void> = Promise.resolve();

	return {
		async run<T>(operation: () => Promise<T>): Promise<T> {
			const previousOperation = currentOperation;
			let releaseQueue: () => void = () => undefined;
			currentOperation = new Promise<void>((resolve) => {
				releaseQueue = resolve;
			});

			await previousOperation;
			try {
				return await operation();
			} finally {
				releaseQueue();
			}
		}
	};
}

export async function runCollectionContentSave(input: CollectionContentSaveInput): Promise<CollectionContentSaveOutcome> {
	const targetCollection = cloneCollection(input.collection);
	let result: CollectionContentSaveResult = {
		ok: false,
		code: 'write-failed',
		message: `Failed to save collection ${targetCollection.name}`
	};

	try {
		result = await input.persistCollectionFile(targetCollection);
	} catch (error) {
		input.logger.error(error);
	}
	const writeAccepted = result.ok;

	const notification: CollectionContentSaveNotification | undefined = writeAccepted
		? input.showSuccessNotification
			? {
					props: {
						message: `Saved collection ${targetCollection.name}`,
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
		targetCollection,
		writeAccepted
	};
}

function getCauseMessage(cause: unknown): string | undefined {
	if (cause instanceof Error) {
		return cause.message;
	}
	if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') {
		return cause.message;
	}
	return undefined;
}

class EffectOperationError extends Error {
	readonly _tag = 'EffectOperationError';

	constructor(
		readonly operation: string,
		readonly cause: unknown,
		message?: string
	) {
		super(message ?? getCauseMessage(cause) ?? String(cause || `Effect operation failed: ${operation}`));
		this.name = 'EffectOperationError';
	}
}

export function toEffectOperationError(operation: string, cause: unknown, message?: string) {
	return new EffectOperationError(operation, cause, message);
}

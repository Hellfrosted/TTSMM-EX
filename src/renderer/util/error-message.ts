const FALLBACK_ERROR_MESSAGE = 'The app received an unexpected error response.';

function formatNamedMessage(value: unknown, depth = 0): string | undefined {
	if (typeof value === 'string' && value.trim()) {
		return value.trim();
	}

	if (value instanceof Error && value.message.trim()) {
		return value.message.trim();
	}

	if (value && typeof value === 'object' && depth < 3) {
		return stringifyErrorRecord(value as Record<string, unknown>, depth + 1);
	}

	return undefined;
}

function stringifyErrorRecord(record: Record<string, unknown>, depth = 0): string | undefined {
	const namedMessage = record.message ?? record.error ?? record.reason ?? record.detail;
	const formattedNamedMessage = formatNamedMessage(namedMessage, depth);
	if (formattedNamedMessage) {
		return formattedNamedMessage;
	}

	try {
		const serialized = JSON.stringify(record);
		return serialized && serialized !== '{}' ? serialized : undefined;
	} catch {
		return undefined;
	}
}

export function formatErrorMessage(error: unknown, fallback = FALLBACK_ERROR_MESSAGE): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}

	if (typeof error === 'string' && error.trim()) {
		return error.trim();
	}

	if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
		return String(error);
	}

	if (error && typeof error === 'object') {
		return stringifyErrorRecord(error as Record<string, unknown>) ?? fallback;
	}

	return fallback;
}

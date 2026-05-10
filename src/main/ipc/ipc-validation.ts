import { Schema } from 'effect';
import type { ValidChannel } from 'shared/ipc';

function formatInvalidEffectPayloadMessage(channel: ValidChannel, error: Schema.SchemaError) {
	return `Invalid IPC payload for ${channel}: ${error.message}`;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

interface ParseEffectIpcPayloadOptions {
	readonly onExcessProperty?: 'error' | 'ignore' | 'preserve';
}

export function parseEffectIpcPayload<S extends Schema.Decoder<unknown, never>>(
	channel: ValidChannel,
	schema: S,
	payload: unknown,
	options: ParseEffectIpcPayloadOptions = {}
): S['Type'] {
	try {
		const decodeOptions =
			options.onExcessProperty === 'ignore'
				? undefined
				: options.onExcessProperty === 'preserve' || options.onExcessProperty === 'error'
					? {
							onExcessProperty: options.onExcessProperty
						}
					: undefined;
		return Schema.decodeUnknownSync(schema)(payload, decodeOptions);
	} catch (error) {
		if (Schema.isSchemaError(error)) {
			throw new Error(formatInvalidEffectPayloadMessage(channel, error));
		}
		throw new Error(`Invalid IPC payload for ${channel}: ${getErrorMessage(error)}`);
	}
}

import type { FieldErrors, Resolver } from 'react-hook-form';

export type FormErrorMap = Record<string, string>;

function assignFieldError(errors: FieldErrors, fieldPath: string, message: string) {
	const path = fieldPath.split('.').filter(Boolean);
	if (path.length === 0) {
		(errors as Record<string, unknown>).root = { type: 'validate', message };
		return;
	}

	let target: Record<string, unknown> = errors;
	path.slice(0, -1).forEach((segment) => {
		target[segment] ??= {};
		target = target[segment] as Record<string, unknown>;
	});
	target[path[path.length - 1]] = { type: 'validate', message };
}

export function createFormResolver<TValues extends object>(validate: (values: TValues) => FormErrorMap): Resolver<TValues> {
	return async (values) => {
		const validationErrors = validate(values as TValues);
		const errors: FieldErrors<TValues> = {};
		Object.entries(validationErrors).forEach(([fieldPath, message]) => {
			assignFieldError(errors, fieldPath, message);
		});

		return {
			values: Object.keys(validationErrors).length === 0 ? values : {},
			errors
		};
	};
}

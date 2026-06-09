export interface ToolbarDropdownMetrics {
	readonly opacity?: unknown;
	readonly pointerEvents?: unknown;
	readonly startOpacity?: unknown;
	readonly transitionDuration?: unknown;
	readonly transitionProperty?: unknown;
}

export interface DialogTransitionMetrics {
	readonly overlayOpacity?: unknown;
	readonly panelOpacity?: unknown;
	readonly panelTransitionProperty?: unknown;
}

const INSTANT_TRANSITION_THRESHOLD_MS = 5;

function parseCssDurationMs(value: string) {
	const trimmedValue = value.trim();
	if (trimmedValue.endsWith('ms')) {
		return Number.parseFloat(trimmedValue.slice(0, -2));
	}
	if (trimmedValue.endsWith('s')) {
		return Number.parseFloat(trimmedValue.slice(0, -1)) * 1000;
	}
	return undefined;
}

function hasOnlyInstantTransitions(value: unknown) {
	if (typeof value !== 'string') {
		return false;
	}

	const durations = value.split(',').map(parseCssDurationMs);
	return durations.length > 0 && durations.every((duration) => duration !== undefined && duration <= INSTANT_TRANSITION_THRESHOLD_MS);
}

export function isToolbarDropdownRenderable(metrics: ToolbarDropdownMetrics) {
	const transitionProperty = typeof metrics.transitionProperty === 'string' ? metrics.transitionProperty : '';
	const finalStateIsOpen = metrics.opacity === '1' && metrics.pointerEvents === 'auto' && transitionProperty.includes('transform');
	if (!finalStateIsOpen) {
		return false;
	}

	const startOpacity = typeof metrics.startOpacity === 'string' ? Number.parseFloat(metrics.startOpacity) : Number.NaN;
	return startOpacity < 1 || hasOnlyInstantTransitions(metrics.transitionDuration);
}

export function isRetriableCapturePageError(error: unknown) {
	return error instanceof Error && error.message.includes('UnknownVizError');
}

export function isDialogTransitionRenderable(metrics: DialogTransitionMetrics) {
	const transitionProperty = typeof metrics.panelTransitionProperty === 'string' ? metrics.panelTransitionProperty : '';
	return metrics.overlayOpacity !== '0' && metrics.panelOpacity !== '0' && transitionProperty.includes('transform');
}

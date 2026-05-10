type StatusSurfaceTone = 'default' | 'error' | 'info' | 'success' | 'warning';

export function getStatusSurfaceClassName(tone: StatusSurfaceTone, defaultClassName = 'border-border bg-surface-elevated') {
	switch (tone) {
		case 'error':
			return 'border-[color-mix(in_srgb,var(--app-color-error)_40%,var(--app-color-border))] bg-[color-mix(in_srgb,var(--app-color-error)_18%,var(--app-color-surface-alt))]';
		case 'warning':
			return 'border-[color-mix(in_srgb,var(--app-color-warning)_38%,var(--app-color-border))] bg-[color-mix(in_srgb,var(--app-color-warning)_16%,var(--app-color-surface-alt))]';
		case 'success':
			return 'border-[color-mix(in_srgb,var(--app-color-success)_42%,var(--app-color-border))] bg-surface-elevated';
		default:
			return defaultClassName;
	}
}

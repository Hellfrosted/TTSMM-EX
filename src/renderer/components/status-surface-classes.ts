type StatusSurfaceTone = 'default' | 'error' | 'info' | 'success' | 'warning';

export function getStatusSurfaceClassName(tone: StatusSurfaceTone, defaultClassName = 'border-border bg-surface-elevated') {
	switch (tone) {
		case 'error':
			return 'border-[var(--app-color-error-border)] bg-[var(--app-color-error-surface)]';
		case 'info':
			return 'border-[var(--app-color-info-border)] bg-[var(--app-color-info-surface)]';
		case 'warning':
			return 'border-[var(--app-color-warning-border)] bg-[var(--app-color-warning-surface)]';
		case 'success':
			return 'border-[var(--app-color-success-border)] bg-[var(--app-color-success-surface)]';
		default:
			return defaultClassName;
	}
}

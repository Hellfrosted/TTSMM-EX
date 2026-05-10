type StatusSurfaceTone = 'default' | 'error' | 'info' | 'success' | 'warning';

export function getStatusSurfaceClassName(tone: StatusSurfaceTone, defaultClassName = 'border-border bg-surface-elevated') {
	switch (tone) {
		case 'error':
			return 'border-error-border bg-error-surface';
		case 'info':
			return 'border-info-border bg-info-surface';
		case 'warning':
			return 'border-warning-border bg-warning-surface';
		case 'success':
			return 'border-success-border bg-success-surface';
		default:
			return defaultClassName;
	}
}

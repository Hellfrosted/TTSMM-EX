export function joinClassNames(...classNames: Array<string | false | null | undefined>) {
	return classNames.filter(Boolean).join(' ');
}

export const desktopControlFocusClassName =
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const desktopInputFocusClassName =
	'focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus:ring-offset-2 focus:ring-offset-background';

export const desktopButtonBaseClassName =
	'box-border inline-flex min-h-control min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm border px-3.5 text-ui font-[650] leading-[var(--app-leading-ui)] text-text transition-[background-color,border-color,color,opacity] duration-140 ease-out motion-reduce:transition-none';

export const desktopInputClassName =
	'box-border min-h-control w-full rounded-sm border border-border bg-surface-elevated px-[11px] text-body leading-[var(--app-leading-body)] text-text outline-none';

export const desktopDisabledClassName = 'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted';

export const desktopDisabledOpacityClassName = 'disabled:cursor-not-allowed disabled:opacity-55';

export const desktopDefaultButtonToneClassName =
	'border-border bg-surface-elevated enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]';

export const desktopPrimaryButtonToneClassName =
	'border-primary bg-primary enabled:hover:border-primary-hover enabled:hover:bg-primary-hover';

export const desktopDangerButtonToneClassName =
	'border-error-action bg-error-action enabled:hover:border-error-action-hover enabled:hover:bg-error-action-hover';

export const desktopSwitchClassName = [
	'relative h-6 w-11 cursor-pointer appearance-none rounded-full border border-border bg-surface-elevated transition-[background-color,border-color] duration-140 ease-out motion-reduce:transition-none',
	"after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-text-muted after:transition-[transform,background-color] after:duration-140 after:ease-out after:content-[''] motion-reduce:after:transition-none",
	'checked:border-[color-mix(in_srgb,var(--app-color-primary)_62%,var(--app-color-border))] checked:bg-[color-mix(in_srgb,var(--app-color-primary)_28%,var(--app-color-surface-elevated))] checked:after:translate-x-5 checked:after:bg-primary',
	desktopDisabledOpacityClassName,
	desktopControlFocusClassName
].join(' ');

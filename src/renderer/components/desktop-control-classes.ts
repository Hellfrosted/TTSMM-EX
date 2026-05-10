export function joinClassNames(...classNames: Array<string | false | null | undefined>) {
	return classNames.filter(Boolean).join(' ');
}

export const desktopControlFocusClassName =
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const desktopInputFocusClassName =
	'focus:border-focus-border focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-background';

export const desktopButtonBaseClassName =
	'box-border inline-flex min-h-control min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm border px-3.5 text-ui font-[650] leading-[var(--app-leading-ui)] text-text transition-[background-color,border-color,color,opacity] duration-140 ease-app-out motion-reduce:transition-none';

export const desktopInputClassName =
	'box-border min-h-control w-full rounded-sm border border-border bg-surface-elevated px-[11px] text-body leading-[var(--app-leading-body)] text-text outline-none';

export const desktopDisabledClassName = 'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted';

export const desktopDisabledOpacityClassName = 'disabled:cursor-not-allowed disabled:opacity-55';

export const desktopDefaultButtonToneClassName = 'border-border bg-surface-elevated enabled:hover:bg-control-hover';

export const desktopPrimaryButtonToneClassName =
	'border-primary bg-primary enabled:hover:border-primary-hover enabled:hover:bg-primary-hover';

export const desktopDangerButtonToneClassName =
	'border-error-action bg-error-action enabled:hover:border-error-action-hover enabled:hover:bg-error-action-hover';

export const desktopSwitchClassName = [
	'DesktopSwitch relative inline-flex h-control w-control shrink-0 cursor-pointer items-center justify-start rounded-sm motion-reduce:[&_.DesktopSwitchThumb]:transition-none motion-reduce:[&_.DesktopSwitchTrack]:transition-none'
].join(' ');

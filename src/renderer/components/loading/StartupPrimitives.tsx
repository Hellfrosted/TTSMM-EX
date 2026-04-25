import type { ButtonHTMLAttributes, ComponentType } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface StartupProgressBarProps {
	percent: number;
	showInfo?: boolean;
	status?: 'active' | 'exception' | 'success';
}

interface StartupStatusIconProps {
	status: 'error' | 'loading' | 'success';
	size?: number;
}

interface StartupButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	loading?: boolean;
	variant?: 'default' | 'primary';
}

export function StartupProgressBar({ percent, showInfo = true, status = 'active' }: StartupProgressBarProps) {
	const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));
	const valueToneClassName = status === 'exception' ? 'bg-error' : status === 'success' ? 'bg-success' : 'bg-primary';

	return (
		<div className="mt-4 flex w-full items-center gap-3">
			<div
				className="relative h-2.5 flex-auto overflow-hidden rounded-full bg-border"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={clampedPercent}
			>
				<div
					className={`absolute inset-y-0 left-0 rounded-[inherit] transition-[width] duration-[160ms] ease-out ${valueToneClassName}`}
					style={{ width: `${clampedPercent}%` }}
				/>
			</div>
			{showInfo ? <span className="min-w-[4ch] text-right font-[650] text-text-muted tabular-nums">{clampedPercent}%</span> : null}
		</div>
	);
}

export function StartupStatusIcon({ size = 32, status }: StartupStatusIconProps) {
	const Icon: ComponentType<LucideProps> = status === 'loading' ? LoaderCircle : status === 'error' ? X : Check;
	const toneClassName =
		status === 'loading' ? 'animate-[spin_900ms_linear_infinite] text-primary' : status === 'error' ? 'text-error' : 'text-success';

	return <Icon className={`block shrink-0 ${toneClassName}`} size={size} aria-hidden="true" />;
}

export function StartupButton({
	children,
	className,
	disabled,
	loading,
	type = 'button',
	variant = 'default',
	...props
}: StartupButtonProps) {
	const buttonClassName = [
		'box-border inline-flex min-h-control cursor-pointer items-center justify-center gap-2 rounded-md border px-4 font-[650] text-text',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-[0.55]',
		variant === 'primary'
			? 'border-primary bg-primary enabled:hover:border-primary-hover enabled:hover:bg-primary-hover'
			: 'border-border bg-surface-elevated enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]',
		className
	]
		.filter(Boolean)
		.join(' ');

	return (
		<button {...props} type={type} disabled={disabled || loading} className={buttonClassName}>
			{loading ? (
				<span
					className="size-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
					aria-hidden="true"
				/>
			) : null}
			{children}
		</button>
	);
}

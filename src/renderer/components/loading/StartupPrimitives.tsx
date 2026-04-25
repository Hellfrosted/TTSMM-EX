import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';

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
	return (
		<div className={`StartupProgressBar StartupProgressBar--${status}`}>
			<div className="StartupProgressBar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampedPercent}>
				<div className="StartupProgressBar__value" style={{ width: `${clampedPercent}%` }} />
			</div>
			{showInfo ? <span className="StartupProgressBar__label">{clampedPercent}%</span> : null}
		</div>
	);
}

export function StartupStatusIcon({ size = 32, status }: StartupStatusIconProps) {
	if (status === 'loading') {
		return <LoaderCircle className="StartupStatusIcon StartupStatusIcon--loading" size={size} aria-hidden="true" />;
	}

	if (status === 'error') {
		return <X className="StartupStatusIcon StartupStatusIcon--error" size={size} aria-hidden="true" />;
	}

	return <Check className="StartupStatusIcon StartupStatusIcon--success" size={size} aria-hidden="true" />;
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
	return (
		<button
			{...props}
			type={type}
			disabled={disabled || loading}
			className={`StartupButton${variant === 'primary' ? ' StartupButton--primary' : ''}${className ? ` ${className}` : ''}`}
		>
			{loading ? <span className="StartupButton__spinner" aria-hidden="true" /> : null}
			{children as ReactNode}
		</button>
	);
}

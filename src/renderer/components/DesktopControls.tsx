import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import {
	desktopButtonBaseClassName,
	desktopControlFocusClassName,
	desktopDangerButtonToneClassName,
	desktopDefaultButtonToneClassName,
	desktopDisabledClassName,
	desktopDisabledOpacityClassName,
	desktopInputClassName,
	desktopInputFocusClassName,
	desktopPrimaryButtonToneClassName,
	desktopSwitchClassName,
	joinClassNames
} from './desktop-control-classes';

interface DesktopButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	danger?: boolean;
	icon?: ReactNode;
	loading?: boolean;
	variant?: 'default' | 'primary';
}

export function DesktopButton({
	children,
	className,
	danger,
	disabled,
	icon,
	loading,
	type = 'button',
	variant = 'default',
	...props
}: DesktopButtonProps) {
	const buttonToneClassName = danger
		? desktopDangerButtonToneClassName
		: variant === 'primary'
			? desktopPrimaryButtonToneClassName
			: desktopDefaultButtonToneClassName;

	return (
		<button
			{...props}
			type={type}
			disabled={disabled || loading}
			className={joinClassNames(
				desktopButtonBaseClassName,
				'DesktopButton',
				desktopControlFocusClassName,
				desktopDisabledOpacityClassName,
				buttonToneClassName,
				className
			)}
		>
			{loading ? (
				<span
					className="size-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
					aria-hidden="true"
				/>
			) : icon ? (
				<span className="inline-flex items-center">{icon}</span>
			) : null}
			{children ? <span className="inline-flex min-w-0 items-center">{children}</span> : null}
		</button>
	);
}

export function DesktopInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			{...props}
			className={joinClassNames(
				'DesktopInput min-w-0',
				desktopInputClassName,
				desktopInputFocusClassName,
				desktopDisabledClassName,
				className
			)}
		/>
	);
}

export function DesktopSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			{...props}
			className={joinClassNames(
				'box-border min-h-control w-full min-w-0 cursor-pointer rounded-md border border-border bg-surface-elevated py-0 pl-[11px] pr-[34px] font-inherit text-text',
				desktopControlFocusClassName,
				className
			)}
		/>
	);
}

export function DesktopSwitch({ className, type = 'checkbox', ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} type={type} className={joinClassNames('DesktopSwitch', desktopSwitchClassName, className)} />;
}

interface DesktopDialogProps {
	bodyClassName?: string;
	children: ReactNode;
	closeLabel?: string;
	footer?: ReactNode;
	onCancel: () => void;
	open: boolean;
	overlayClassName?: string;
	panelClassName?: string;
	title: string;
	titleClassName?: string;
}

export function DesktopDialog({
	bodyClassName,
	children,
	closeLabel = 'Close dialog',
	footer,
	onCancel,
	open,
	overlayClassName,
	panelClassName,
	title,
	titleClassName
}: DesktopDialogProps) {
	const titleId = useId();
	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onCancel();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [onCancel, open]);

	if (!open) {
		return null;
	}

	return (
		<div
			className={joinClassNames(
				'fixed inset-0 z-[1000] flex items-center justify-center bg-[color-mix(in_srgb,var(--app-color-background)_72%,transparent)] p-6',
				overlayClassName
			)}
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					onCancel();
				}
			}}
		>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className={joinClassNames(
					'flex max-h-[min(680px,calc(100vh_-_48px))] w-[min(560px,100%)] flex-col overflow-hidden rounded-md border border-border bg-surface-elevated shadow-[0_16px_36px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)]',
					panelClassName
				)}
			>
				<div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
					<h2 id={titleId} className={joinClassNames('m-0 text-lg leading-[1.3] text-text', titleClassName)}>
						{title}
					</h2>
					<DesktopButton aria-label={closeLabel} icon={<X size={16} aria-hidden="true" />} onClick={onCancel} />
				</div>
				<div className={joinClassNames('overflow-auto p-4', bodyClassName)}>{children}</div>
				{footer ? <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border px-4 py-3.5">{footer}</div> : null}
			</section>
		</div>
	);
}

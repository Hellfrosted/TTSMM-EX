import { X } from 'lucide-react';
import {
	type ButtonHTMLAttributes,
	type CSSProperties,
	type InputHTMLAttributes,
	type ReactNode,
	type Ref,
	type SelectHTMLAttributes,
	useEffect,
	useEffectEvent,
	useId,
	useRef
} from 'react';
import { createPortal } from 'react-dom';
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
	labelClassName?: string;
	loading?: boolean;
	variant?: 'default' | 'primary';
}

interface DesktopIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: ReactNode;
}

interface DesktopInputProps extends InputHTMLAttributes<HTMLInputElement> {
	ref?: Ref<HTMLInputElement>;
}

interface DesktopInlineControlsProps {
	children: ReactNode;
	className?: string;
}

export function DesktopButton({
	children,
	className,
	danger,
	disabled,
	icon,
	labelClassName,
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
			aria-busy={loading ? true : props['aria-busy']}
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
					className="DesktopButtonSpinner size-3.5 shrink-0 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current motion-reduce:animate-none"
					aria-hidden="true"
				/>
			) : icon ? (
				<span className="DesktopButtonIcon inline-flex shrink-0 items-center">{icon}</span>
			) : null}
			{children ? (
				<span className={joinClassNames('DesktopButtonLabel inline-flex min-w-0 items-center', labelClassName)}>{children}</span>
			) : null}
		</button>
	);
}

export function DesktopInput({ className, ref, ...props }: DesktopInputProps) {
	return (
		<input
			{...props}
			ref={ref}
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

export function DesktopIconButton({ children, className, type = 'button', ...props }: DesktopIconButtonProps) {
	return (
		<button
			{...props}
			type={type}
			className={joinClassNames(
				'DesktopIconButton inline-flex h-control min-h-control w-control min-w-control cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted transition-[background-color,color,opacity] duration-140 ease-out enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] enabled:hover:text-text disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none',
				desktopControlFocusClassName,
				className
			)}
		>
			{children}
		</button>
	);
}

export function DesktopInlineControls({ children, className }: DesktopInlineControlsProps) {
	return (
		<div
			className={joinClassNames(
				'flex w-full min-w-0 items-stretch [&_.DesktopButton]:shrink-0 [&_.DesktopButton]:rounded-l-none [&_.DesktopInput]:min-w-0 [&_.DesktopInput]:rounded-r-none',
				className
			)}
		>
			{children}
		</div>
	);
}

export function DesktopSelect({ children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			{...props}
			className={joinClassNames(
				'DesktopSelect box-border min-h-control w-full min-w-0 cursor-pointer rounded-sm border border-border bg-surface-elevated py-0 pl-2.75 pr-8.5 font-inherit text-body leading-[var(--app-leading-body)] text-text',
				desktopControlFocusClassName,
				desktopDisabledClassName,
				className
			)}
		>
			{children}
		</select>
	);
}

export function DesktopSwitch({ className, type = 'checkbox', ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<span className={joinClassNames(desktopSwitchClassName, className)}>
			<input {...props} type={type} className="DesktopSwitchInput" />
			<span className="DesktopSwitchTrack" aria-hidden="true">
				<span className="DesktopSwitchThumb" />
			</span>
		</span>
	);
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
	panelStyle?: CSSProperties;
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
	panelStyle,
	title,
	titleClassName
}: DesktopDialogProps) {
	const titleId = useId();
	const overlayRef = useRef<HTMLDivElement>(null);
	const handleCancel = useEffectEvent(() => {
		onCancel();
	});

	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const overlay = overlayRef.current;
		const siblingStates =
			overlay?.parentElement && overlay.parentElement.children.length > 1
				? [...overlay.parentElement.children].reduce<
						{
							ariaHidden: string | null;
							element: Element;
							inert?: boolean;
						}[]
					>((states, element) => {
						if (element !== overlay) {
							states.push({
								element,
								ariaHidden: element.getAttribute('aria-hidden'),
								inert: 'inert' in element ? (element as HTMLElement & { inert: boolean }).inert : undefined
							});
						}
						return states;
					}, [])
				: [];
		for (const state of siblingStates) {
			state.element.setAttribute('aria-hidden', 'true');
			if (state.inert !== undefined) {
				(state.element as HTMLElement & { inert: boolean }).inert = true;
			}
		}

		const getFocusableElements = () =>
			[
				...(overlay?.querySelectorAll<HTMLElement>(
					'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
				) ?? [])
			].filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
		window.requestAnimationFrame(() => {
			getFocusableElements()[0]?.focus();
		});

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				handleCancel();
				return;
			}
			if (event.key !== 'Tab') {
				return;
			}
			const focusableElements = getFocusableElements();
			if (focusableElements.length === 0) {
				event.preventDefault();
				return;
			}
			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];
			if (event.shiftKey && document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			} else if (!event.shiftKey && document.activeElement === lastElement) {
				event.preventDefault();
				firstElement.focus();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			for (const state of siblingStates) {
				if (state.ariaHidden === null) {
					state.element.removeAttribute('aria-hidden');
				} else {
					state.element.setAttribute('aria-hidden', state.ariaHidden);
				}
				if (state.inert !== undefined) {
					(state.element as HTMLElement & { inert: boolean }).inert = state.inert;
				}
			}
			if (previousActiveElement?.isConnected) {
				previousActiveElement.focus();
			}
		};
	}, [open]);

	if (!open) {
		return null;
	}

	const portalTarget = document.querySelector<HTMLElement>('.AppRoot') ?? document.body;

	const dialog = (
		// biome-ignore lint/a11y/noStaticElementInteractions: the backdrop listens for outside-click dismissal while the dialog content remains semantic.
		<div
			ref={overlayRef}
			className={joinClassNames(
				'fixed inset-0 z-1000 flex items-center justify-center bg-[color-mix(in_srgb,var(--app-color-background)_72%,transparent)] p-6',
				'DesktopDialogOverlay',
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
					'flex max-h-[min(680px,calc(100vh-48px))] w-[min(560px,100%)] flex-col overflow-hidden rounded-sm border border-border bg-surface-elevated shadow-[0_10px_24px_color-mix(in_srgb,var(--app-color-background)_76%,transparent)]',
					'DesktopDialogPanel',
					panelClassName
				)}
				style={panelStyle}
			>
				<div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
					<h2
						id={titleId}
						className={joinClassNames('DesktopDialogTitle m-0 text-title leading-[var(--app-leading-tight)] text-text', titleClassName)}
					>
						{title}
					</h2>
					<DesktopIconButton aria-label={closeLabel} title={closeLabel} onClick={onCancel}>
						<X size={16} aria-hidden="true" />
					</DesktopIconButton>
				</div>
				<div className={joinClassNames('overflow-auto p-4', bodyClassName)}>{children}</div>
				{footer ? <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border px-4 py-3.5">{footer}</div> : null}
			</section>
		</div>
	);

	return createPortal(dialog, portalTarget);
}

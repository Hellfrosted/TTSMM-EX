import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface StartupCardProps extends HTMLAttributes<HTMLElement> {
	wide?: boolean;
}

interface StartupStatusCardProps extends HTMLAttributes<HTMLDivElement> {
	error?: boolean;
}

interface StartupStatusContentProps extends HTMLAttributes<HTMLDivElement> {
	large?: boolean;
}

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

interface StartupActionsProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

interface StartupErrorTextProps extends HTMLAttributes<HTMLElement> {
	children: ReactNode;
}

export function StartupScreen({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full min-h-0 w-full min-w-0 flex-1 bg-background">
			<main className="box-border flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-auto px-4 py-6 xl:px-6 xl:py-8">
				{children}
			</main>
		</div>
	);
}

export function StartupCard({ children, className, wide = false, ...props }: StartupCardProps) {
	const cardClassName = [
		'w-full rounded-md border border-border bg-surface px-5 py-[22px] shadow-[0_16px_36px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)] xl:p-7',
		wide ? 'max-w-[760px]' : 'max-w-[680px] xl:pb-6',
		className
	]
		.filter(Boolean)
		.join(' ');

	return (
		<section {...props} className={cardClassName}>
			{children}
		</section>
	);
}

export function StartupHeroRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const rowClassName = ['mb-6 flex items-center justify-between gap-6', className].filter(Boolean).join(' ');
	return (
		<div {...props} className={rowClassName}>
			{children}
		</div>
	);
}

export function StartupHeroCopy({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const copyClassName = ['min-w-0 flex-[1_1_340px]', className].filter(Boolean).join(' ');
	return (
		<div {...props} className={copyClassName}>
			{children}
		</div>
	);
}

export function StartupHeroArtwork({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const artworkClassName = ['hidden shrink-0 items-center min-[993px]:flex', className].filter(Boolean).join(' ');
	return (
		<div {...props} className={artworkClassName}>
			{children}
		</div>
	);
}

export function StartupEyebrow({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	const eyebrowClassName = ['block font-[650] text-text-muted', className].filter(Boolean).join(' ');
	return (
		<span {...props} className={eyebrowClassName}>
			{children}
		</span>
	);
}

export function StartupTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
	const titleClassName = ['mb-2 mt-2.5 text-[1.65rem] font-bold leading-[1.2] text-text', className].filter(Boolean).join(' ');
	return (
		<h2 {...props} className={titleClassName}>
			{children}
		</h2>
	);
}

export function StartupIntro({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
	const introClassName = ['mb-5 mt-0 leading-[1.55] text-text-muted', className].filter(Boolean).join(' ');
	return (
		<p {...props} className={introClassName}>
			{children}
		</p>
	);
}

export function StartupStatusCard({ children, className, error = false, ...props }: StartupStatusCardProps) {
	const statusClassName = ['rounded-md border bg-surface-alt px-4 py-3.5', error ? 'border-error' : 'border-border', className]
		.filter(Boolean)
		.join(' ');
	return (
		<div {...props} className={statusClassName}>
			{children}
		</div>
	);
}

export function StartupStatusContent({ children, className, large = false, ...props }: StartupStatusContentProps) {
	const contentClassName = ['flex gap-3.5', large ? 'items-center' : 'items-start', className].filter(Boolean).join(' ');
	return (
		<div {...props} className={contentClassName}>
			{children}
		</div>
	);
}

export function StartupStatusTitle({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
	const titleClassName = ['mb-1 block', className].filter(Boolean).join(' ');
	return (
		<strong {...props} className={titleClassName}>
			{children}
		</strong>
	);
}

export function StartupStatusDetail({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	const detailClassName = ['text-text-muted tabular-nums', className].filter(Boolean).join(' ');
	return (
		<span {...props} className={detailClassName}>
			{children}
		</span>
	);
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

export function StartupActions({ children, className, ...props }: StartupActionsProps) {
	const actionsClassName = ['mt-4 flex w-full flex-wrap items-start gap-3', className].filter(Boolean).join(' ');
	return (
		<div {...props} className={actionsClassName}>
			{children}
		</div>
	);
}

export function StartupErrorText({ children, className, ...props }: StartupErrorTextProps) {
	const errorClassName = [
		'block max-w-full rounded-md border border-[color-mix(in_srgb,var(--app-color-error)_40%,var(--app-color-border))]',
		'bg-[color-mix(in_srgb,var(--app-color-error)_18%,var(--app-color-surface-alt))] px-3 py-2.5 text-error [overflow-wrap:anywhere]',
		className
	]
		.filter(Boolean)
		.join(' ');

	return (
		<code {...props} className={errorClassName}>
			{children}
		</code>
	);
}

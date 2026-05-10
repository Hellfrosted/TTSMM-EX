import { LoaderCircle } from 'lucide-react';

interface ViewStageLoadingFallbackProps {
	title: string;
	detail: string;
	compact?: boolean;
}

export default function ViewStageLoadingFallback({ title, detail, compact = false }: ViewStageLoadingFallbackProps) {
	const containerClassName = [
		'box-border flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-auto',
		compact ? 'p-3' : 'p-6'
	].join(' ');
	const cardClassName = [
		'w-full rounded-md border border-border',
		compact
			? 'bg-surface-alt px-4 py-3.5 shadow-none'
			: 'max-w-[520px] bg-surface px-5 py-[18px] shadow-[0_12px_28px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)]'
	].join(' ');

	return (
		<div className={containerClassName} role="status" aria-live="polite" aria-busy="true">
			<div className={cardClassName}>
				<div className="flex items-start gap-3">
					<LoaderCircle
						className="shrink-0 animate-[spin_900ms_linear_infinite] text-primary"
						size={compact ? 22 : 30}
						aria-hidden="true"
					/>
					<div className="min-w-0">
						<strong className="mb-1 block">{title}</strong>
						<p className="m-0 text-text-muted">{detail}</p>
					</div>
				</div>
			</div>
		</div>
	);
}

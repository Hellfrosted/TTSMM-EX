import { useId } from 'react';
import { LoaderCircle } from 'lucide-react';

interface ViewStageLoadingFallbackProps {
	title: string;
	detail: string;
	compact?: boolean;
}

export default function ViewStageLoadingFallback({ title, detail, compact = false }: ViewStageLoadingFallbackProps) {
	const titleId = useId();
	const detailId = useId();
	const containerClassName = [
		'box-border flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-auto',
		compact ? 'p-3' : 'p-6'
	].join(' ');
	const cardClassName = [
		'w-full rounded-sm border border-border',
		compact ? 'bg-surface-alt px-4 py-3.5 shadow-none' : 'max-w-[520px] bg-surface px-5 py-[18px] shadow-none'
	].join(' ');

	return (
		<div
			className={containerClassName}
			role="status"
			aria-live="polite"
			aria-busy="true"
			aria-labelledby={titleId}
			aria-describedby={detailId}
		>
			<div className={cardClassName}>
				<div className="flex items-start gap-3">
					<LoaderCircle
						className="shrink-0 animate-[spin_900ms_linear_infinite] text-primary motion-reduce:animate-none"
						size={compact ? 22 : 30}
						aria-hidden="true"
					/>
					<div className="min-w-0">
						<strong id={titleId} className="mb-1 block">
							{title}
						</strong>
						<p id={detailId} className="m-0 text-text-muted">
							{detail}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

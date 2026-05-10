import { LoaderCircle } from 'lucide-react';

interface ViewStageLoadingFallbackProps {
	title: string;
	detail: string;
	compact?: boolean;
}

export default function ViewStageLoadingFallback({ title, detail, compact = false }: ViewStageLoadingFallbackProps) {
	return (
		<div
			className={`ViewStageLoadingFallback${compact ? ' ViewStageLoadingFallback--compact' : ''}`}
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<div className={`ViewStageLoadingFallback__card${compact ? ' ViewStageLoadingFallback__card--compact' : ''}`}>
				<div className="ViewStageLoadingFallback__body">
					<LoaderCircle className="ViewStageLoadingFallback__spinner" size={compact ? 22 : 30} aria-hidden="true" />
					<div className="ViewStageLoadingFallback__copy">
						<strong className="ViewStageLoadingFallback__title">{title}</strong>
						<p className="ViewStageLoadingFallback__detail">{detail}</p>
					</div>
				</div>
			</div>
		</div>
	);
}

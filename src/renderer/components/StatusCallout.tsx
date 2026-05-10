import type { HTMLAttributes, ReactNode } from 'react';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { getStatusSurfaceClassName } from './status-surface-classes';

interface StatusCalloutProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	heading: ReactNode;
	tone?: 'default' | 'error' | 'warning';
}

export default function StatusCallout({ children, className, heading, tone = 'default', ...props }: StatusCalloutProps) {
	const toneClassName = getStatusSurfaceClassName(tone, 'border-border bg-surface-alt');
	const calloutClassName = ['StatusCallout box-border w-full rounded-sm border px-3.5 py-3', toneClassName, className]
		.filter(Boolean)
		.join(' ');
	const Icon = tone === 'error' ? CircleAlert : tone === 'warning' ? TriangleAlert : undefined;
	const iconClassName = tone === 'error' ? 'text-error' : 'text-warning';

	return (
		<div {...props} className={calloutClassName} data-tone={tone}>
			<div className="flex min-w-0 items-start gap-2.5">
				{Icon ? <Icon className={`mt-0.5 shrink-0 ${iconClassName}`} size={18} aria-hidden="true" /> : null}
				<div className="min-w-0">
					<strong className="StatusCalloutTitle mb-1 block">{heading}</strong>
					<span className="StatusCalloutBody block wrap-break-word leading-[1.45]">{children}</span>
				</div>
			</div>
		</div>
	);
}

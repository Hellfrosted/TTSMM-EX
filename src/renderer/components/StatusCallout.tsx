import type { HTMLAttributes, ReactNode } from 'react';
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

	return (
		<div {...props} className={calloutClassName} data-tone={tone}>
			<strong className="StatusCalloutTitle mb-1 block">{heading}</strong>
			<span className="StatusCalloutBody block wrap-break-word leading-[1.45]">{children}</span>
		</div>
	);
}

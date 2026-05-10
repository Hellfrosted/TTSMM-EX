import type { HTMLAttributes, ReactNode } from 'react';

interface StatusCalloutProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	heading: ReactNode;
	tone?: 'default' | 'error' | 'warning';
}

export default function StatusCallout({ children, className, heading, tone = 'default', ...props }: StatusCalloutProps) {
	const toneClassName =
		tone === 'error'
			? 'border-[color-mix(in_srgb,var(--app-color-error)_40%,var(--app-color-border))] bg-[color-mix(in_srgb,var(--app-color-error)_18%,var(--app-color-surface-alt))]'
			: tone === 'warning'
				? 'border-[color-mix(in_srgb,var(--app-color-warning)_38%,var(--app-color-border))] bg-[color-mix(in_srgb,var(--app-color-warning)_16%,var(--app-color-surface-alt))]'
				: 'border-border bg-surface-alt';
	const calloutClassName = ['box-border w-full rounded-md border px-3.5 py-3', toneClassName, className].filter(Boolean).join(' ');

	return (
		<div {...props} className={calloutClassName}>
			<strong className="mb-1 block">{heading}</strong>
			<span className="block break-words leading-[1.45] text-text">{children}</span>
		</div>
	);
}

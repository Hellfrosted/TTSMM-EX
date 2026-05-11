import { Maximize2, Minimize2, PanelBottom, PanelRight, X } from 'lucide-react';
import type { ReactNode } from 'react';

import missing from '../../../../assets/missing.png';

type ModDetailsHalfLayoutMode = 'side' | 'bottom';

interface DetailIconButtonProps {
	'aria-label': string;
	'aria-pressed'?: boolean;
	children: ReactNode;
	onClick: () => void;
	title?: string;
}

interface ModDetailsFooterHeaderProps {
	bigDetails: boolean;
	halfLayoutMode: ModDetailsHalfLayoutMode;
	identity: string;
	name?: ReactNode;
	onClose: () => void;
	onExpandChange: (expanded: boolean) => void;
	onToggleHalfLayout: () => void;
}

interface ModDetailsPreviewProps {
	altText: string;
	path?: string;
}

export function DetailIconButton({
	'aria-label': ariaLabel,
	'aria-pressed': ariaPressed,
	children,
	onClick,
	title
}: DetailIconButtonProps) {
	return (
		<button
			type="button"
			className="ModDetailIconButton"
			aria-label={ariaLabel}
			aria-pressed={ariaPressed}
			title={title ?? ariaLabel}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

export function ModDetailsFooterHeader({
	bigDetails,
	halfLayoutMode,
	identity,
	name,
	onClose,
	onExpandChange,
	onToggleHalfLayout
}: ModDetailsFooterHeaderProps) {
	return (
		<div
			className="ModDetailFooterHeader"
			style={{
				width: '100%',
				minHeight: 'calc(var(--app-control-height) + 4px)',
				padding: '8px 16px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 16
			}}
		>
			<div>
				<h2 className="ModDetailFooterTitle">{name}</h2>
				<div className="ModDetailFooterIdentity" title={identity}>
					{identity}
				</div>
			</div>
			<div className="ModDetailFooterHeaderActions">
				<DetailIconButton
					aria-label={halfLayoutMode === 'side' ? 'Switch to bottom details panel' : 'Switch to side details panel'}
					aria-pressed={halfLayoutMode === 'side'}
					title={halfLayoutMode === 'side' ? 'Use bottom details panel' : 'Use side details panel'}
					onClick={onToggleHalfLayout}
				>
					{halfLayoutMode === 'side' ? <PanelBottom size={18} aria-hidden="true" /> : <PanelRight size={18} aria-hidden="true" />}
				</DetailIconButton>
				<DetailIconButton
					aria-label={bigDetails ? 'Return details to panel view' : 'Expand details to full view'}
					aria-pressed={bigDetails}
					title={bigDetails ? 'Return to details panel' : 'Expand details to full view'}
					onClick={() => {
						onExpandChange(!bigDetails);
					}}
				>
					{bigDetails ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
				</DetailIconButton>
				<DetailIconButton aria-label="Close details" title="Close details" onClick={onClose}>
					<X size={18} aria-hidden="true" />
				</DetailIconButton>
			</div>
		</div>
	);
}

export function ModDetailsPreview({ altText, path }: ModDetailsPreviewProps) {
	return (
		<div className="ModDetailFooterPreview">
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: image error handling swaps in the bundled missing-preview asset. */}
			<img
				src={path || missing}
				alt={altText}
				onError={(event) => {
					event.currentTarget.src = missing;
				}}
			/>
		</div>
	);
}

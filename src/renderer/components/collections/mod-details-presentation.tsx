import type { ReactNode } from 'react';
import { Maximize2, Minimize2, PanelBottom, PanelRight, X } from 'lucide-react';

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
		<button type="button" className="ModDetailIconButton" aria-label={ariaLabel} aria-pressed={ariaPressed} title={title} onClick={onClick}>
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
				minHeight: 48,
				padding: '8px 16px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 16
			}}
		>
			<div>
				<h2 className="ModDetailFooterTitle">{name}</h2>
				<div className="ModDetailFooterIdentity">{identity}</div>
			</div>
			<div className="ModDetailFooterHeaderActions">
				<DetailIconButton
					aria-label={halfLayoutMode === 'side' ? 'Switch to bottom split layout' : 'Switch to side-by-side split layout'}
					aria-pressed={halfLayoutMode === 'side'}
					title={halfLayoutMode === 'side' ? 'Use bottom split for half view' : 'Use side-by-side split for half view'}
					onClick={onToggleHalfLayout}
				>
					{halfLayoutMode === 'side' ? <PanelBottom size={18} aria-hidden="true" /> : <PanelRight size={18} aria-hidden="true" />}
				</DetailIconButton>
				<DetailIconButton
					aria-label={bigDetails ? 'Return details to split view' : 'Expand details to full view'}
					aria-pressed={bigDetails}
					title={bigDetails ? 'Return to split details' : 'Expand details to full view'}
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

import { HardDrive } from 'lucide-react';
import { ModType } from 'model';
import type { ReactNode } from 'react';
import steam from '../../../../assets/steam.png';
import ttmm from '../../../../assets/ttmm.png';

export function getModTypeLabel(type: ModType) {
	switch (type) {
		case ModType.LOCAL:
			return 'Local mod';
		case ModType.TTQMM:
			return 'TTMM mod';
		case ModType.WORKSHOP:
			return 'Steam Workshop mod';
		default:
			return 'Mod';
	}
}

function ModTypeIconWrapper({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
	return (
		<span className={className} role="img" aria-label={label} title={label}>
			{children}
		</span>
	);
}

export function ModTypeIcon({ className = '', size = 15, type }: { className?: string; size?: number; type: ModType }) {
	const label = getModTypeLabel(type);
	switch (type) {
		case ModType.LOCAL:
			return (
				<ModTypeIconWrapper className={className} label={label}>
					<HardDrive size={size} aria-hidden="true" />
				</ModTypeIconWrapper>
			);
		case ModType.TTQMM:
			return <img src={ttmm} width={size} alt={label} key="type" title={label} />;
		case ModType.WORKSHOP:
			return <img src={steam} width={size} alt={label} key="type" title={label} />;
		default:
			return null;
	}
}

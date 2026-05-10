import { memo, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

const INTERACTIVE_ROW_TARGET_SELECTOR =
	'a[href],button,input,select,textarea,[role="button"],[role="checkbox"],[role="switch"],[tabindex]:not([tabindex="-1"])';

function isInteractiveRowTarget(target: EventTarget | null, currentTarget: HTMLElement) {
	if (!(target instanceof Element)) {
		return false;
	}

	const interactiveTarget = target.closest(INTERACTIVE_ROW_TARGET_SELECTOR);
	return !!interactiveTarget && interactiveTarget !== currentTarget && currentTarget.contains(interactiveTarget);
}

interface VirtualTableBodyProps {
	children: ReactNode;
	className: string;
	height: number;
	width: number;
}

export function VirtualTableBody({ children, className, height, width }: VirtualTableBodyProps) {
	return (
		<tbody className={className} style={{ height, width }}>
			{children}
		</tbody>
	);
}

interface VirtualTableRowProps {
	'aria-label'?: string;
	'aria-selected'?: boolean;
	children: ReactNode;
	className: string;
	dataIndex: number;
	measureElement: (element: HTMLTableRowElement | null) => void;
	onActivate?: () => void;
	onContextMenu?: () => void;
	onDoubleClick?: () => void;
	rowHeight?: number;
	start: number;
	tabIndex?: number;
	width: number;
}

export const VirtualTableRow = memo(function VirtualTableRow({
	children,
	className,
	dataIndex,
	measureElement,
	onActivate,
	onContextMenu,
	onDoubleClick,
	rowHeight,
	start,
	tabIndex = 0,
	width,
	...props
}: VirtualTableRowProps) {
	const activateFromClick = (event: MouseEvent<HTMLTableRowElement>) => {
		if (event.defaultPrevented || isInteractiveRowTarget(event.target, event.currentTarget)) {
			return;
		}

		onActivate?.();
	};

	const activateFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>) => {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		onActivate?.();
	};

	return (
		<tr
			{...props}
			ref={measureElement}
			data-index={dataIndex}
			className={className}
			style={{ height: rowHeight, transform: `translateY(${start}px)`, width }}
			aria-keyshortcuts={onActivate ? 'Enter Space' : undefined}
			aria-roledescription={onActivate ? 'selectable row' : undefined}
			tabIndex={tabIndex}
			onClick={activateFromClick}
			onContextMenu={onContextMenu}
			onDoubleClick={onDoubleClick}
			onKeyDown={activateFromKeyboard}
		>
			{children}
		</tr>
	);
});

import { type KeyboardEvent, type MouseEvent, memo, type ReactNode } from 'react';

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
	keyboardShortcuts?: string;
	onActivate?: (event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>) => void;
	onContextMenu?: () => void;
	onDoubleClick?: () => void;
	onKeyDown?: (event: KeyboardEvent<HTMLTableRowElement>) => void;
	rowHeight?: number;
	start: number;
	tabIndex?: number;
	width: number;
}

export const VirtualTableRow = memo(function VirtualTableRow({
	children,
	className,
	dataIndex,
	keyboardShortcuts,
	onActivate,
	onContextMenu,
	onDoubleClick,
	onKeyDown,
	rowHeight,
	start,
	tabIndex,
	width,
	...props
}: VirtualTableRowProps) {
	const activateFromClick = (event: MouseEvent<HTMLTableRowElement>) => {
		if (event.defaultPrevented || isInteractiveRowTarget(event.target, event.currentTarget)) {
			return;
		}

		event.currentTarget.focus();
		onActivate?.(event);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
		onKeyDown?.(event);
		if (event.defaultPrevented) {
			return;
		}

		if (isInteractiveRowTarget(event.target, event.currentTarget)) {
			return;
		}

		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		onActivate?.(event);
	};
	const resolvedTabIndex = tabIndex ?? (onActivate ? 0 : undefined);

	return (
		<tr
			{...props}
			data-index={dataIndex}
			className={className}
			style={{ height: rowHeight, transform: `translateY(${start}px)`, width }}
			aria-keyshortcuts={keyboardShortcuts ?? (onActivate ? 'Enter Space' : undefined)}
			aria-roledescription={onActivate ? 'selectable row' : undefined}
			tabIndex={resolvedTabIndex}
			onClick={activateFromClick}
			onContextMenu={onContextMenu}
			onDoubleClick={onDoubleClick}
			onKeyDown={handleKeyDown}
		>
			{children}
		</tr>
	);
});

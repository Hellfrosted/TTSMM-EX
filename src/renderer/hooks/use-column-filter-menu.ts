import { useCallback, useEffect, useRef, useState } from 'react';

export function useColumnFilterMenu(width: number) {
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

	const closeMenu = useCallback((restoreFocus = true) => {
		setMenuPosition(null);
		if (restoreFocus) buttonRef.current?.focus();
	}, []);

	const openMenu = useCallback(() => {
		const bounds = buttonRef.current?.getBoundingClientRect();
		if (!bounds) return;
		setMenuPosition({
			x: Math.min(Math.max(8, bounds.right - width), Math.max(8, window.innerWidth - width - 8)),
			y: Math.min(bounds.bottom + 4, Math.max(8, window.innerHeight - 304))
		});
	}, [width]);

	useEffect(() => {
		if (!menuPosition) return;

		const focusFirstOption = window.requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
		});
		const closeFromPointer = (event: MouseEvent) => {
			const target = event.target;
			if (target instanceof Node && (menuRef.current?.contains(target) || buttonRef.current?.contains(target))) return;
			closeMenu(false);
		};
		const closeFromKeyboard = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMenu();
			}
		};
		window.addEventListener('mousedown', closeFromPointer);
		window.addEventListener('keydown', closeFromKeyboard);
		return () => {
			window.cancelAnimationFrame(focusFirstOption);
			window.removeEventListener('mousedown', closeFromPointer);
			window.removeEventListener('keydown', closeFromKeyboard);
		};
	}, [menuPosition, closeMenu]);

	return { buttonRef, menuRef, menuPosition, openMenu, closeMenu };
}

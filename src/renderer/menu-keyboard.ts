type MenuItemDirection = 1 | -1 | 'first' | 'last';

interface MenuKeyboardOptions {
	closeMenu: () => void;
	closeMenuOnTab?: () => void;
	menu: HTMLElement | null;
}

export function focusMenuItem(menu: HTMLElement | null, direction: MenuItemDirection) {
	const menuItems = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
	if (menuItems.length === 0) {
		return;
	}
	const activeIndex = menuItems.findIndex((item) => item === document.activeElement);
	if (direction === 'first') {
		menuItems[0].focus();
		return;
	}
	if (direction === 'last') {
		menuItems[menuItems.length - 1].focus();
		return;
	}
	const nextIndex = activeIndex < 0 ? 0 : (activeIndex + direction + menuItems.length) % menuItems.length;
	menuItems[nextIndex].focus();
}

export function handleMenuKeyboardNavigation(event: KeyboardEvent, { closeMenu, closeMenuOnTab = closeMenu, menu }: MenuKeyboardOptions) {
	if (event.key === 'Escape') {
		event.preventDefault();
		closeMenu();
		return;
	}
	if (!menu?.contains(document.activeElement)) {
		return;
	}
	if (event.key === 'ArrowDown') {
		event.preventDefault();
		focusMenuItem(menu, 1);
	} else if (event.key === 'ArrowUp') {
		event.preventDefault();
		focusMenuItem(menu, -1);
	} else if (event.key === 'Home') {
		event.preventDefault();
		focusMenuItem(menu, 'first');
	} else if (event.key === 'End') {
		event.preventDefault();
		focusMenuItem(menu, 'last');
	} else if (event.key === 'Tab') {
		closeMenuOnTab();
	}
}

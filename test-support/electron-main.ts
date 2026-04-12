import { vi } from 'vitest';

export const app = {
	getPath: vi.fn(() => 'C:\\Users\\tester\\AppData\\Roaming\\ttsmm'),
	quit: vi.fn(),
	on: vi.fn(),
	whenReady: vi.fn(() => Promise.resolve()),
	isPackaged: false,
	getVersion: vi.fn(() => '2.0.0'),
	getName: vi.fn(() => 'TerraTech Steam Mod Manager EX')
};

export class WebContents {
	send = vi.fn();
	reload = vi.fn();
	toggleDevTools = vi.fn();
	setWindowOpenHandler = vi.fn();
	on = vi.fn();
}

export class BrowserWindow {
	webContents = new WebContents();
	loadURL = vi.fn();
	once = vi.fn();
	on = vi.fn();
	setTitle = vi.fn();
	maximize = vi.fn();
	show = vi.fn();
	focus = vi.fn();
	minimize = vi.fn();
	close = vi.fn();
	setFullScreen = vi.fn();
	isFullScreen = vi.fn(() => false);
}

export const ipcMain = {
	on: vi.fn(),
	handle: vi.fn()
};

export const protocol = {
	registerFileProtocol: vi.fn()
};

export const Menu = {
	buildFromTemplate: vi.fn(() => ({
		popup: vi.fn()
	})),
	setApplicationMenu: vi.fn()
};

export class MenuItem {}

export const dialog = {
	showOpenDialog: vi.fn(async () => ({
		canceled: true,
		filePaths: []
	})),
	showMessageBox: vi.fn(async () => ({
		response: 0
	}))
};

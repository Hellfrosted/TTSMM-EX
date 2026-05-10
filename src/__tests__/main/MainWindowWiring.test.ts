import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => {
	const instances: MockBrowserWindow[] = [];

	class MockBrowserWindow {
		options: Record<string, unknown>;
		loadURL = vi.fn();
		show = vi.fn();
		focus = vi.fn();
		minimize = vi.fn();
		setMenuBarVisibility = vi.fn();
		setTitle = vi.fn();
		onceHandlers = new Map<string, () => void>();
		once = vi.fn((eventName: string, handler: () => void) => {
			this.onceHandlers.set(eventName, handler);
		});
		webContents = {
			on: vi.fn(),
			setWindowOpenHandler: vi.fn()
		};

		constructor(options: Record<string, unknown>) {
			this.options = options;
			instances.push(this);
		}
	}

	return {
		BrowserWindow: vi.fn(MockBrowserWindow),
		instances,
		app: {
			isPackaged: false,
			getName: vi.fn(() => 'TTSMM-EX'),
			getPath: vi.fn(() => '/app/exe'),
			getVersion: vi.fn(() => '1.2.3')
		},
		session: {
			defaultSession: {
				extensions: {
					getAllExtensions: vi.fn(() => []),
					loadExtension: vi.fn(),
					on: vi.fn(),
					removeExtension: vi.fn(),
					removeListener: vi.fn()
				}
			}
		}
	};
});

const menuMock = vi.hoisted(() => ({
	buildMenu: vi.fn(),
	constructors: [] as unknown[]
}));

const externalLinksMock = vi.hoisted(() => ({
	openExternalUrl: vi.fn()
}));

vi.mock('electron', () => electronMock);
vi.mock('electron-log', () => ({
	default: {
		error: vi.fn(),
		info: vi.fn(),
		processMessage: vi.fn(),
		transports: { file: {} }
	}
}));
vi.mock('../../main/menu', () => ({
	default: class MockMenuBuilder {
		constructor(mainWindow: unknown) {
			menuMock.constructors.push(mainWindow);
		}

		buildMenu() {
			menuMock.buildMenu();
		}
	}
}));
vi.mock('../../main/external-links', () => externalLinksMock);
vi.mock('../../main/util', () => ({
	resolveHtmlPath: vi.fn((fileName: string) => `app://renderer/${fileName}`),
	resolvePreloadPath: vi.fn(() => '/dist/preload/preload.js')
}));

describe('main window wiring', () => {
	beforeEach(() => {
		electronMock.instances.length = 0;
		vi.clearAllMocks();
		menuMock.constructors.length = 0;
		delete process.env.START_MINIMIZED;
	});

	it('creates the BrowserWindow with hardened renderer settings and app shell wiring', async () => {
		const { createMainWindow, MAIN_WINDOW_DEFAULT_BOUNDS } = await import('../../main/window');
		const onDidFinishLoad = vi.fn();

		const mainWindow = await createMainWindow({ isDevelopment: false, onDidFinishLoad });

		expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(1);
		expect(mainWindow).toBe(electronMock.instances[0]);
		expect(electronMock.instances[0].options).toEqual(
			expect.objectContaining({
				show: false,
				...MAIN_WINDOW_DEFAULT_BOUNDS,
				autoHideMenuBar: process.platform !== 'darwin',
				webPreferences: {
					contextIsolation: true,
					sandbox: true,
					preload: '/dist/preload/preload.js'
				}
			})
		);
		expect(electronMock.instances[0].loadURL).toHaveBeenCalledWith('app://renderer/index.html');
		expect(menuMock.constructors).toEqual([mainWindow]);
		expect(menuMock.buildMenu).toHaveBeenCalledTimes(1);
		if (process.platform === 'darwin') {
			expect(electronMock.instances[0].setMenuBarVisibility).not.toHaveBeenCalled();
		} else {
			expect(electronMock.instances[0].setMenuBarVisibility).toHaveBeenCalledWith(false);
		}

		const readyToShow = electronMock.instances[0].onceHandlers.get('ready-to-show');
		expect(readyToShow).toBeDefined();
		readyToShow?.();
		expect(electronMock.instances[0].show).toHaveBeenCalledTimes(1);
		expect(electronMock.instances[0].focus).toHaveBeenCalledTimes(1);

		const windowOpenHandler = vi.mocked(electronMock.instances[0].webContents.setWindowOpenHandler).mock.calls[0]?.[0];
		expect(windowOpenHandler?.({ url: 'https://example.com' })).toEqual({ action: 'deny' });
		expect(externalLinksMock.openExternalUrl).toHaveBeenCalledWith('https://example.com');
	});
});

import type { ElectronApi } from '../../shared/electron-api';

declare global {
	interface Window {
		electron: ElectronApi;
	}
}

export {};

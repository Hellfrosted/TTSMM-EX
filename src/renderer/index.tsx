import { createRoot } from 'react-dom/client';
import { MemoryRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';

import 'antd/dist/reset.css';
import './App.global.less';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import App from './App';
import ConfigLoadingComponent from './components/loading/ConfigLoading';
import LoadingView from './views/LoadingView';
import SettingsRoute from './views/SettingsView';
import CollectionRoute from './views/CollectionView';
import MainCollectionComponent from './components/collections/MainCollectionComponent';
import SteamworksVerification from './components/loading/SteamworksVerification';

const rootElement = document.getElementById('root');

if (!rootElement) {
	throw new Error('Root element not found');
}

if (typeof BigInt !== 'undefined' && typeof (BigInt.prototype as { toJSON?: () => string }).toJSON !== 'function') {
	// React's development render instrumentation stringifies props/state and will throw on bigint without a toJSON hook.
	Object.defineProperty(BigInt.prototype, 'toJSON', {
		value() {
			return this.toString();
		},
		configurable: true,
		writable: true
	});
}

createRoot(rootElement).render(
	<ConfigProvider
		theme={{
			algorithm: theme.darkAlgorithm,
			token: {
				fontFamily: 'Roboto, sans-serif',
				colorBgBase: '#141414'
			},
			components: {
				Layout: {
					siderBg: '#000000',
					triggerBg: '#001529',
					headerBg: '#001529',
					bodyBg: '#141414',
					footerBg: '#141414'
				},
				Menu: {
					darkItemBg: '#000000',
					darkSubMenuItemBg: '#000000'
				}
			}
		}}
	>
		<Router>
			<Routes>
				<Route path="/" element={<App />}>
					{/* Settings manager */}
					<Route path="settings" element={<SettingsRoute />} />
					{/* Paths that indicate the application is processing request to load something from disk */}
					<Route path="loading" element={<LoadingView />}>
						<Route path="config" element={<ConfigLoadingComponent />} />
						<Route path="steamworks" element={<SteamworksVerification />} />
					</Route>
					{/* The actual collection management components */}
					<Route path="collections" element={<CollectionRoute />}>
						<Route index element={<Navigate replace to="main" />} />
						<Route path="main" element={<MainCollectionComponent />} />
						<Route path="*" element={<Navigate replace to="main" />} />
					</Route>
				</Route>
			</Routes>
		</Router>
	</ConfigProvider>
);

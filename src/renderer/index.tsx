import { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter as Router, Navigate, Routes, Route } from 'react-router-dom';

import 'antd/dist/reset.css';
import './App.global.less';

import App from './App';
import LoadingView from './views/LoadingView';

const loadConfigLoading = () => import('./components/loading/ConfigLoading');
const loadSteamworksVerification = () => import('./components/loading/SteamworksVerification');

const ConfigLoadingComponentLazy = lazy(async () => {
	const module = await loadConfigLoading();
	return { default: module.default };
});

const SteamworksVerificationLazy = lazy(async () => {
	const module = await loadSteamworksVerification();
	return { default: module.default };
});

function RouteChunkFallback({ label }: { label: string }) {
	return (
		<div
			aria-live="polite"
			role="status"
			style={{
				padding: '24px 28px',
				fontSize: 14,
				color: 'var(--app-color-text-base, rgba(255, 255, 255, 0.88))'
			}}
		>
			{label}
		</div>
	);
}

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
	<Router>
		<Routes>
			<Route path="/" element={<App />}>
				<Route path="settings" />
				{/* Paths that indicate the application is processing request to load something from disk */}
				<Route path="loading" element={<LoadingView />}>
					<Route
						path="config"
						element={
							<Suspense fallback={<RouteChunkFallback label="Loading startup checks..." />}>
								<ConfigLoadingComponentLazy />
							</Suspense>
						}
					/>
					<Route
						path="steamworks"
						element={
							<Suspense fallback={<RouteChunkFallback label="Loading Steamworks verification..." />}>
								<SteamworksVerificationLazy />
							</Suspense>
						}
					/>
				</Route>
				{/* The actual collection management components */}
				<Route path="collections">
					<Route index element={<Navigate replace to="main" />} />
					<Route path="main" />
					<Route path="*" element={<Navigate replace to="main" />} />
				</Route>
			</Route>
		</Routes>
	</Router>
);

import { Suspense, lazy } from 'react';
import { MemoryRouter as Router, Navigate, Route, Routes } from 'react-router-dom';

import App from './App';
import ViewStageLoadingFallback from './components/loading/ViewStageLoadingFallback';
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
	return <ViewStageLoadingFallback compact title={label} detail="Preparing startup flow." />;
}

function StageRoutePlaceholder() {
	return null;
}

export function AppRoutes() {
	return (
		<Routes>
			<Route path="/" element={<App />}>
				<Route path="settings" element={<StageRoutePlaceholder />} />
				<Route path="block-lookup" element={<StageRoutePlaceholder />} />
				{/* Paths that indicate the application is processing request to load something from disk */}
				<Route path="loading" element={<LoadingView />}>
					<Route
						path="config"
						element={
							<Suspense fallback={<RouteChunkFallback label="Loading startup checks" />}>
								<ConfigLoadingComponentLazy />
							</Suspense>
						}
					/>
					<Route
						path="steamworks"
						element={
							<Suspense fallback={<RouteChunkFallback label="Loading Steamworks verification" />}>
								<SteamworksVerificationLazy />
							</Suspense>
						}
					/>
				</Route>
				{/* The actual collection management components */}
				<Route path="collections">
					<Route index element={<Navigate replace to="main" />} />
					<Route path="main" element={<StageRoutePlaceholder />} />
					<Route path="*" element={<Navigate replace to="main" />} />
				</Route>
			</Route>
			<Route path="*" element={<Navigate replace to="/collections/main" />} />
		</Routes>
	);
}

export function AppRouter() {
	return (
		<Router>
			<AppRoutes />
		</Router>
	);
}

import { lazy, Suspense } from 'react';
import { Navigate, Route, MemoryRouter as Router, Routes } from 'react-router-dom';
import { APP_ROUTES } from 'shared/app-route-policy';

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
				<Route path={APP_ROUTES.settings} element={<StageRoutePlaceholder />} />
				<Route path={APP_ROUTES.populationPool} element={<StageRoutePlaceholder />} />
				<Route path={APP_ROUTES.blockLookup} element={<StageRoutePlaceholder />} />
				<Route path={APP_ROUTES.loading} element={<LoadingView />}>
					<Route
						path={APP_ROUTES.loadingConfig}
						element={
							<Suspense fallback={<RouteChunkFallback label="Loading startup checks" />}>
								<ConfigLoadingComponentLazy />
							</Suspense>
						}
					/>
					<Route
						path={APP_ROUTES.loadingSteamworks}
						element={
							<Suspense fallback={<RouteChunkFallback label="Loading Steamworks verification" />}>
								<SteamworksVerificationLazy />
							</Suspense>
						}
					/>
				</Route>
				<Route path={APP_ROUTES.collections}>
					<Route index element={<Navigate replace to={APP_ROUTES.collectionMain} />} />
					<Route path={APP_ROUTES.collectionMain} element={<StageRoutePlaceholder />} />
					<Route path="*" element={<Navigate replace to={APP_ROUTES.collectionMain} />} />
				</Route>
			</Route>
			<Route path="*" element={<Navigate replace to={APP_ROUTES.collectionMain} />} />
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

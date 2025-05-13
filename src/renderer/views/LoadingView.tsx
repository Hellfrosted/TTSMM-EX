import React from 'react';
import { AppState } from 'model';
import { Outlet, useOutletContext } from 'react-router-dom';

export default function () {
	const appState: AppState = useOutletContext<AppState>();
	return <Outlet context={appState} />;
}

import React from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { AppState } from 'model';

export default function () {
	const appState: AppState = useOutletContext<AppState>();
	return <Outlet context={appState} />;
}

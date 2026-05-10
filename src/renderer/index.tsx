import './App.tailwind.css';
import './App.global.css';

void import('./renderer-entry').catch((error) => {
	window.setTimeout(() => {
		throw error;
	});
});

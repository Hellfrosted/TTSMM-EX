import './App.tailwind.css';
import './App.global.css';

const zodGlobal = globalThis as typeof globalThis & {
	__zod_globalConfig?: {
		jitless?: boolean;
	};
};

zodGlobal.__zod_globalConfig = {
	...zodGlobal.__zod_globalConfig,
	jitless: true
};

void import('./renderer-entry').catch((error) => {
	window.setTimeout(() => {
		throw error;
	});
});

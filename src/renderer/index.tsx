import { createRoot } from 'react-dom/client';

import './App.tailwind.css';
import './App.global.css';

import { AppRouter } from './routes';

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

createRoot(rootElement).render(<AppRouter />);

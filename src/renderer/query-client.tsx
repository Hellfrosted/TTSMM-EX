import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 15_000
		}
	}
});

export function AppQueryProvider({ children }: PropsWithChildren) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

import { QueryClient } from '@tanstack/react-query';

/**
 * Offline-first: queries read localStorage synchronously.
 * Cloud sync runs separately — never block UI on network.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      networkMode: 'always',
      retry: false,
    },
    mutations: {
      networkMode: 'always',
      retry: false,
    },
  },
});

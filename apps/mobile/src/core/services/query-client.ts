import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes staleTime
      gcTime: 1000 * 60 * 30,    // 30 minutes gcTime
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
  },
});
export default queryClient;

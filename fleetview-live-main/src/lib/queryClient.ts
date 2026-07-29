import { QueryClient } from '@tanstack/react-query';

// Lives outside App.tsx so non-React code (the auth store's logout teardown)
// can clear the cache without importing the component tree.
export const queryClient = new QueryClient({
  defaultOptions: {
    // Safety net so stragglers without an explicit staleTime don't refetch on
    // every window focus/mount.
    queries: { staleTime: 30_000 },
  },
});

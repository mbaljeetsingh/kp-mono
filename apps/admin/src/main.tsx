import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { SessionProvider } from '~/lib/session';
import { router } from '~/router';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The catalogue is written by a weekly crawler, so refetching on every
      // focus is a round trip for data that has not moved.
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Inside the query client: permissions are a query. Outside the router:
          every route reads the same session, and the shell gates on it. */}
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>
);

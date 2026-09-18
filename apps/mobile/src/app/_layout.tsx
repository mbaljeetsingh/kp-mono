import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

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

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
        <Stack.Screen name="(tabs)" />
        {/* A sheet rather than a pushed screen: the full player is a layer over
            what you were browsing, not somewhere you navigated to. */}
        <Stack.Screen
          name="now-playing"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.95] }}
        />
      </Stack>
    </QueryClientProvider>
  );
}

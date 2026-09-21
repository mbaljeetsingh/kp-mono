import { colors } from '@kp/tokens/colors';
import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '~/lib/session';

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
      <SessionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          {/* A modal rather than a pushed screen: the full player is a layer over
            what you were browsing, not somewhere you navigated to.
            
            `modal`, not `formSheet`: a form sheet with detents does not give its
            content a resolved height, so flex:1 came out as zero — the scroll
            area collapsed and the transport sat directly under the header. */}
          <Stack.Screen name="now-playing" options={{ presentation: 'modal' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
        </Stack>
      </SessionProvider>
    </QueryClientProvider>
  );
}

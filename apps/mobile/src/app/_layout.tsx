import '../global.css';

import { Newsreader_500Medium, Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import { NotoSerifGurmukhi_400Regular } from '@expo-google-fonts/noto-serif-gurmukhi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { LockScreenArtwork } from '~/components/LockScreenArtwork';
import { SessionProvider } from '~/lib/session';
import { useColors } from '~/lib/theme';

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

// Held until the fonts are in, so the first frame is not drawn in the system
// face and then swapped. They are bundled assets, so this is a few ms.
SplashScreen.preventAutoHideAsync();

/*
 * One family per weight, named the way global.css names them.
 *
 * iOS resolves a custom font by its PostScript name and Android by its file
 * name, and the Google Fonts files disagree between the two. Registering each
 * weight under a name of our own is the one form both platforms read the same.
 */
const FONTS = {
  'Newsreader-Medium': Newsreader_500Medium,
  'Newsreader-SemiBold': Newsreader_600SemiBold,
  'NotoSerifGurmukhi-Regular': NotoSerifGurmukhi_400Regular,
};

/*
 * The tabs are always the bottom of the stack, however the app was opened.
 *
 * A shared link that cold-starts the app (src/app/r/[id].tsx) would otherwise
 * build a stack of one — the player — and its close button, which goes back,
 * had nothing to go back to: the listener was stuck in it. The same held for
 * any deep link to search, a ragi or the archive.
 */
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const colors = useColors();
  const [fontsReady, fontError] = useFonts(FONTS);

  useEffect(() => {
    // A font that fails to load is not worth a blank app — show the system
    // face and move on.
    if (fontsReady || fontError) void SplashScreen.hideAsync();
  }, [fontsReady, fontError]);

  if (!fontsReady && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        {/* `auto` follows Appearance, which the theme choice sets. */}
        <StatusBar style="auto" />
        <LockScreenArtwork />
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

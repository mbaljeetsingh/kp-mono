/**
 * Arriving from a shared link: `/r/<rendition id>?t=<seconds>` — the web's
 * links (apps/player/src/routes/shared.ts), opened in the app when it is
 * installed (Universal Links on iOS, an intent filter on Android).
 *
 * Not a screen to stay on. It loads the shabad into the player — parked at `t`,
 * paused, as the web does — and replaces itself with the full player, so Back
 * leaves the link rather than landing on it and loading it again.
 */
import { shabadById } from '@kp/api';
import { linkStartPosition } from '@kp/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { playerActions } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export default function SharedLinkScreen() {
  const router = useRouter();
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    shabadById(supabase, id)
      .then((item) => {
        if (!live) return;
        if (!item) {
          setProblem('That shabad isn’t available any more.');
          return;
        }
        playerActions.cue(item, linkStartPosition(item, t));
        router.replace('/now-playing');
      })
      .catch(() => {
        if (live) setProblem('Could not open that shabad. Check your connection and try again.');
      });
    return () => {
      live = false;
    };
    // Once per arrival: the link's id and t are the whole input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  return (
    <Screen edges={['top']} className="flex-1 items-center justify-center gap-4 bg-background px-8">
      <Text className="text-center text-sm text-muted-foreground">
        {problem ?? 'Opening the shabad…'}
      </Text>
      {problem ? (
        <Pressable onPress={() => router.replace('/')} className="rounded-lg bg-muted px-4 py-2">
          <Text className="text-foreground">Go home</Text>
        </Pressable>
      ) : null}
      <View />
    </Screen>
  );
}

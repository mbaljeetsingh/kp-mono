/**
 * A row of ragis that scrolls sideways — Home's shelf and Search's ragi
 * results, as the web's RagiShelf is both.
 */
import type { Artist } from '@kp/api';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { artistPhotoUrl } from '~/lib/supabase';

export function RagiShelf({ artists }: { artists: Artist[] }) {
  const router = useRouter();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-3 px-5"
    >
      {artists.map((a) => (
        <Pressable
          key={a.name}
          onPress={() => router.push({ pathname: '/ragi/[name]', params: { name: a.name } })}
          className="w-24 items-center gap-2 active:opacity-70"
        >
          <ArtTile
            name={a.display_name ?? a.name}
            src={artistPhotoUrl(a.photo_path)}
            size={88}
            rounded={44}
          />
          <Text numberOfLines={2} className="text-center text-xs text-foreground">
            {a.display_name ?? a.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

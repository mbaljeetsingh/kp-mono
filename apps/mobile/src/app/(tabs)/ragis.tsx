import { useArtists } from '@kp/api';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtTile } from '~/components/ArtTile';
import { artistPhotoUrl, supabase } from '~/lib/supabase';

export default function RagisScreen() {
  const router = useRouter();
  const query = useArtists(supabase);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-950">
      <FlatList
        data={query.data ?? []}
        keyExtractor={(a) => a.name}
        numColumns={3}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <Text className="px-3 pb-2 pt-3 text-2xl font-semibold text-white">Ragis</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/ragi/[name]', params: { name: item.name } })}
            className="flex-1 items-center gap-2 p-3 active:opacity-70">
            <ArtTile
              name={item.display_name ?? item.name}
              src={artistPhotoUrl(item.photo_path)}
              size={72}
              rounded={36}
            />
            <Text numberOfLines={2} className="text-center text-xs text-white">
              {item.display_name ?? item.name}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          query.isLoading ? null : (
            <Text className="px-3 py-8 text-sm text-neutral-400">No ragis yet.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

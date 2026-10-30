/**
 * The ragi directory — Home's ragi shelf's "See all", as on the web.
 */
import { useArtists } from '@kp/api';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { ArtTile } from '~/components/ArtTile';
import { artistPhotoUrl, supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';

export default function RagisScreen() {
  const colors = useColors();
  const router = useRouter();
  const query = useArtists(supabase);

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={query.data ?? []}
        keyExtractor={(a) => a.name}
        numColumns={3}
        contentContainerClassName="px-2 pb-4"
        ListHeaderComponent={
          <View className="gap-1 px-3 pb-2 pt-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-1 pb-1">
              <ChevronLeft size={16} color={colors.mutedForeground} />
              <Text className="text-sm text-muted-foreground">Home</Text>
            </Pressable>
            <Text className="font-display text-[28px] leading-8 text-foreground">Ragis</Text>
            <Text className="text-sm text-muted-foreground">
              Everyone with published shabads in the archive.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/ragi/[name]', params: { name: item.name } })}
            className="flex-1 items-center gap-2 p-3 active:opacity-70"
          >
            <ArtTile
              name={item.display_name ?? item.name}
              src={artistPhotoUrl(item.photo_path)}
              size={72}
              rounded={36}
            />
            <Text numberOfLines={2} className="text-center text-xs text-foreground">
              {item.display_name ?? item.name}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          query.isLoading ? null : query.isError ? (
            <Pressable onPress={() => void query.refetch()} className="px-3 py-8">
              <Text className="text-sm text-destructive">
                Could not load the directory. Tap to try again.
              </Text>
            </Pressable>
          ) : (
            <View className="gap-1 px-3 py-8">
              <Text className="text-sm text-foreground">No ragis yet.</Text>
              <Text className="text-sm text-muted-foreground">
                They appear as shabads are tagged.
              </Text>
            </View>
          )
        }
      />
    </Screen>
  );
}

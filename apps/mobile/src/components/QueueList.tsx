/**
 * Up next — the real queue when there is one, suggestions when there is not.
 *
 * The queue is empty almost all of the time, so this panel spent its life
 * saying "Nothing queued". The suggestions are only suggestions: nothing here
 * is queued and nothing plays on its own, because a shabad is often put on for
 * its own sake and continuing unasked is the listener's call.
 */
import { fetchSuggestionGroups } from '@kp/api';
import { upNext, type Playable } from '@kp/core';
import { colors } from '@kp/tokens/colors';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { playerActions, usePlayer } from '~/lib/player';
import { artistPhotoUrl, supabase } from '~/lib/supabase';

export function QueueList() {
  const items = usePlayer((s) => s.items);
  const index = usePlayer((s) => s.index);
  const repeat = usePlayer((s) => s.repeat);
  const current = usePlayer((s) => s.current);

  const queued = upNext({ items, index, repeat });

  const suggestions = useQuery({
    queryKey: ['suggestions', current?.id],
    queryFn: () => fetchSuggestionGroups(supabase, current),
    // Asked for whenever the queue has nothing, including during radio: a
    // listener on a broadcast is exactly who might want somewhere to go next.
    enabled: queued.length === 0,
    staleTime: 1000 * 60 * 5,
  });

  if (queued.length) {
    return (
      <View className="gap-1 py-2">
        <Text className="px-1 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
          Up next
        </Text>
        {queued.map((item, i) => (
          <Row
            key={`${item.id}-${i}`}
            item={item}
            onPlay={() => playerActions.playAt(index + 1 + i)}
            onRemove={() => playerActions.removeAt(index + 1 + i)}
          />
        ))}
        <Pressable onPress={playerActions.clearQueue} className="px-1 pt-2">
          <Text className="text-sm text-muted-foreground">Clear queue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-4 py-2">
      {(suggestions.data ?? []).map((group) => (
        <View key={group.label} className="gap-1">
          <Text className="px-1 text-xs uppercase tracking-wider text-muted-foreground">
            {group.label}
          </Text>
          {group.items.map((item) => (
            <Row key={item.id} item={item} onPlay={() => playerActions.play(item)} />
          ))}
        </View>
      ))}

      {suggestions.isLoading ? (
        <Text className="px-1 py-2 text-sm text-muted-foreground">Loading…</Text>
      ) : null}

      {!suggestions.isLoading && !(suggestions.data ?? []).length ? (
        <Text className="px-1 py-2 text-sm text-muted-foreground">
          Nothing published yet to suggest.
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  item,
  onPlay,
  onRemove,
}: {
  item: Playable;
  onPlay: () => void;
  onRemove?: () => void;
}) {
  return (
    <Pressable
      onPress={onPlay}
      className="flex-row items-center gap-3 rounded-lg px-1 py-2 active:bg-accent">
      <ArtTile name={item.artist ?? item.title} src={artistPhotoUrl(item.artistPhoto)} size={36} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm text-foreground">
          {item.title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {item.subtitle ?? item.artist}
        </Text>
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityLabel={`Remove ${item.title} from the queue`}
          hitSlop={8}
          className="size-8 items-center justify-center">
          <X size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

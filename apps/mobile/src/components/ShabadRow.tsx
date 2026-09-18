/**
 * One rendition in a list.
 *
 * `isCurrent` and `playing` come from the parent: fifty rows each subscribing
 * to the player is fifty subscriptions re-evaluated ten times a second.
 */
import { segmentTotal, type Playable } from '@kp/core';
import { Pressable, Text, View } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { artistPhotoUrl } from '~/lib/supabase';

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ShabadRow({
  item,
  isCurrent,
  onPress,
}: {
  item: Playable;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const length = segmentTotal(item, 0);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-muted">
      <ArtTile name={item.artist ?? item.title} src={artistPhotoUrl(item.artistPhoto)} />

      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className={isCurrent ? 'text-primary' : 'text-foreground'}>
          {item.title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {item.subtitle ?? item.artist}
          {item.raag ? ` · ${item.raag}` : ''}
        </Text>
      </View>

      {/* Zero means untagged — a whole file whose length nobody knows until it
          loads, so showing 0:00 would be a lie. */}
      {length > 0 ? (
        <Text className="text-xs text-muted-foreground">{clock(length)}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * One rendition in a list.
 *
 * `isCurrent` and `playing` come from the parent: fifty rows each subscribing
 * to the player is fifty subscriptions re-evaluated ten times a second.
 */
import { segmentTotal, type Playable } from '@kp/core';
import { colors } from '@kp/tokens/colors';
import { Heart, MoreHorizontal } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { ArtTile } from '~/components/ArtTile';
import { PressableScale } from '~/components/PressableScale';
import { useSession } from '~/lib/session';
import { artistPhotoUrl } from '~/lib/supabase';

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ShabadRow({
  item,
  isCurrent,
  onPress,
  onMore,
}: {
  item: Playable;
  isCurrent: boolean;
  onPress: () => void;
  onMore?: (item: Playable) => void;
}) {
  const { favorites } = useSession();
  const length = segmentTotal(item, 0);
  const saved = favorites.has(item.id);

  return (
    <PressableScale
      onPress={onPress}
      // A whole row, so it moves less than a button would.
      scaleTo={0.985}
      className={
        isCurrent
          ? 'flex-row items-center gap-3 rounded-xl bg-card px-2 py-2 active:bg-accent'
          : 'flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-card'
      }
    >
      <ArtTile
        name={item.artist ?? item.title}
        src={artistPhotoUrl(item.artistPhoto)}
        size={52}
        rounded={10}
      />

      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={isCurrent ? 'font-medium text-primary' : 'font-medium text-foreground'}
        >
          {item.title}
        </Text>
        <Text numberOfLines={1} className="text-[13px] leading-[18px] text-muted-foreground">
          {item.subtitle ?? item.artist}
          {item.raag ? ` · ${item.raag}` : ''}
        </Text>
      </View>

      {/* Zero means untagged — a whole file whose length nobody knows until it
          loads, so showing 0:00 would be a lie. */}
      {length > 0 ? (
        <Text className="text-xs tabular-nums text-subtle-foreground">{clock(length)}</Text>
      ) : null}

      {saved ? <Heart size={14} color={colors.primary} fill={colors.primary} /> : null}

      {onMore ? (
        <Pressable
          onPress={() => onMore(item)}
          accessibilityLabel={`More for ${item.title}`}
          hitSlop={8}
          className="size-8 items-center justify-center"
        >
          <MoreHorizontal size={18} color={colors.subtleForeground} />
        </Pressable>
      ) : null}
    </PressableScale>
  );
}

/**
 * One rendition in a list.
 *
 * `isCurrent` and `playing` come from the parent: fifty rows each subscribing
 * to the player is fifty subscriptions re-evaluated ten times a second.
 */
import { segmentTotal, type Playable } from '@kp/core';
import { Heart, MoreHorizontal } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { PlayableArt } from '~/components/ArtTile';
import { PressableScale } from '~/components/PressableScale';
import { ShabadTitle } from '~/components/ShabadTitle';
import { playerActions } from '~/lib/player';
import { useSession } from '~/lib/session';
import { useShownTitle } from '~/lib/title-script';
import { useColors } from '~/lib/theme';

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
  const colors = useColors();
  const { favorites } = useSession();
  const length = segmentTotal(item, 0);
  const saved = favorites.has(item.id);
  const title = useShownTitle(item);

  return (
    <PressableScale
      // The row already playing pauses and resumes, as on the web — starting
      // it again from the top is never what a tap on it means.
      onPress={isCurrent ? playerActions.toggle : onPress}
      // A whole row, so it moves less than a button would.
      scaleTo={0.985}
      className={
        isCurrent
          ? 'flex-row items-center gap-3 rounded-xl bg-card px-2 py-2 active:bg-accent'
          : 'flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-card'
      }
    >
      <PlayableArt item={item} size={52} rounded={10} />

      <View className="min-w-0 flex-1">
        <ShabadTitle
          item={item}
          numberOfLines={1}
          className={isCurrent ? 'font-medium text-primary' : 'font-medium text-foreground'}
        />
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

      {/* Saving without the ⋯ sheet, as the web's rows do. */}
      <Pressable
        onPress={() => favorites.toggle(item.id)}
        accessibilityLabel={saved ? `Remove ${title} from saved` : `Save ${title}`}
        hitSlop={6}
        className="size-8 items-center justify-center"
      >
        <Heart
          size={16}
          color={saved ? colors.primary : colors.subtleForeground}
          fill={saved ? colors.primary : 'transparent'}
        />
      </Pressable>

      {onMore ? (
        <Pressable
          onPress={() => onMore(item)}
          accessibilityLabel={`More for ${title}`}
          hitSlop={8}
          className="size-8 items-center justify-center"
        >
          <MoreHorizontal size={18} color={colors.subtleForeground} />
        </Pressable>
      ) : null}
    </PressableScale>
  );
}

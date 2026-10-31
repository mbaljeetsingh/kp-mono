/**
 * Up next — the real queue when there is one, suggestions when there is not.
 *
 * The queue is empty almost all of the time, so this panel spent its life
 * saying "Nothing queued". The suggestions are only suggestions: nothing here
 * is queued and nothing plays on its own, because a shabad is often put on for
 * its own sake and continuing unasked is the listener's call.
 */
import { fetchSuggestionGroups, useOtherRecordings } from '@kp/api';
import { clock, segmentTotal, upNext, type Playable } from '@kp/core';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PlayableArt } from '~/components/ArtTile';
import { ShabadTitle } from '~/components/ShabadTitle';
import { playerActions, usePlayer } from '~/lib/player';
import { useShownTitle } from '~/lib/title-script';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';

export function QueueList() {
  const currentId = usePlayer((s) => s.current?.id);
  return (
    <>
      {/* Keyed, so it closes again when the shabad changes. */}
      <OtherRecordings key={currentId} />
      <Queue />
    </>
  );
}

/**
 * The same shabad in other voices, as on the web: one line until asked for,
 * nothing at all for a shabad with one recording, and only for a rendition's own
 * tag, because a looked-up shabad is the listener's guess.
 */
function OtherRecordings() {
  const colors = useColors();
  const current = usePlayer((s) => s.current);
  const others = useOtherRecordings(supabase, current?.shabadId, current?.id).data ?? [];
  const [open, setOpen] = useState(false);
  if (!others.length) return null;

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View className="border-b border-border py-1">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between gap-2 px-1 py-2 active:opacity-60"
      >
        <Text className="text-[13px] font-medium text-primary">
          {others.length === 1 ? '1 other recording' : `${others.length} other recordings`} of this
          shabad
        </Text>
        <Chevron size={16} color={colors.primary} />
      </Pressable>
      {open
        ? others.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => playerActions.swapCurrent(item)}
              accessibilityRole="button"
              className="flex-row items-center justify-between gap-3 px-1 py-2.5 active:opacity-60"
            >
              <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                {item.subtitle ?? item.artist ?? item.title}
              </Text>
              <Text className="text-xs tabular-nums text-muted-foreground">
                {clock(segmentTotal(item, 0))}
              </Text>
            </Pressable>
          ))
        : null}
    </View>
  );
}

function Queue() {
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
  const colors = useColors();
  const title = useShownTitle(item);
  return (
    <Pressable
      onPress={onPlay}
      className="flex-row items-center gap-3 rounded-lg px-1 py-2 active:bg-accent"
    >
      <PlayableArt item={item} size={36} />
      <View className="min-w-0 flex-1">
        <ShabadTitle item={item} numberOfLines={1} className="text-sm text-foreground" />
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {item.subtitle ?? item.artist}
        </Text>
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityLabel={`Remove ${title} from the queue`}
          hitSlop={8}
          className="size-8 items-center justify-center"
        >
          <X size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

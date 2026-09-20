/**
 * The full player.
 *
 * What you scan sits at the top; what you touch sits at the bottom. The
 * transport is pinned below the scrolling text for the reason every music app
 * puts it there: the bottom third of a phone is where a thumb already rests.
 */
import { colors } from '@kp/tokens/colors';
import { useShabadText } from '@kp/api';
import { clock, highlightVerseId, isAligned, REPEAT_LABELS } from '@kp/core';
import { useRouter } from 'expo-router';
import {
  ChevronDown,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Badge } from '@kp/ui-native/badge';
import { Text as UIText } from '@kp/ui-native/text';

import { Screen } from '~/components/Screen';
import { BANIDB_BASE } from '~/lib/links';
import { ArtTile } from '~/components/ArtTile';
import { QueueList } from '~/components/QueueList';
import { ReadAlongLine } from '~/components/ReadAlongLine';
import { SeekBar } from '~/components/SeekBar';
import { ShabadSearch } from '~/components/ShabadSearch';
import { useSession } from '~/lib/session';
import { playerActions, usePlayer } from '~/lib/player';
import { skipToNext } from '~/lib/skip';
import { artistPhotoUrl } from '~/lib/supabase';

/** BaniDB, direct on native: there is no browser origin to be blocked by CORS. */

export default function NowPlayingScreen() {
  const router = useRouter();

  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const repeat = usePlayer((s) => s.repeat);

  /**
   * A shabad the listener looked up themselves. A broadcast is never tagged and
   * most of the archive is not either, so without this the panel is a dead end
   * exactly when somebody most wants it.
   */
  const [lookedUp, setLookedUp] = useState<number | null>(null);
  useEffect(() => {
    setLookedUp(null);
    lineTops.current = {};
    scrolledTo.current = null;
  }, [current?.id]);

  const shabadId = current?.shabadId ?? lookedUp;
  const query = useShabadText(BANIDB_BASE, shabadId);
  const lines = query.data?.verses ?? [];
  // Timings belong to the tagged rendition, so a looked-up shabad lights
  // nothing — there is nothing aligning it to this audio.
  const lit = current?.shabadId ? highlightVerseId(current, position) : null;

  const [tab, setTab] = useState<'lyrics' | 'queue'>('lyrics');
  const { favorites } = useSession();

  /**
   * Follow the singing.
   *
   * React Native has no scrollIntoView, so each line reports its own offset on
   * layout and the scroll is aimed at the one being sung. Offsets are held in a
   * ref rather than state — they arrive one per line during layout, and storing
   * them in state would re-render the whole shabad once per line.
   */
  const scroller = useRef<ScrollView>(null);
  const lineTops = useRef<Record<number, number>>({});
  const viewportHeight = useRef(0);

  /**
   * The panel is the reader's once they drag it. Somebody who scrolled down to
   * read a later translation must not be yanked back every time the singing
   * advances; following resumes after a pause.
   */
  const READER_HOLD_MS = 8000;
  const draggedAt = useRef(0);

  // Falls back to the tagger's anchor when nothing is being sung, so opening
  // mid-alaap still lands on the refrain rather than the top of the shabad.
  const anchorId = lit ?? current?.mainVerseId ?? null;

  /**
   * Scroll the sung line into the middle.
   *
   * Attempted from two places on purpose. The effect covers the anchor
   * changing while the shabad is already laid out; `rememberLine` covers the
   * opposite order, which is the common one — on open, the anchor is known
   * before a single line has reported its offset, so an effect that only ran
   * once found nothing and never tried again. `scrolledTo` keeps the two from
   * fighting over the same line.
   */
  const scrolledTo = useRef<number | null>(null);

  const scrollToAnchor = useCallback((verseId: number | null) => {
    if (verseId == null || scrolledTo.current === verseId) return;
    const top = lineTops.current[verseId];
    if (top == null) return;
    // The panel is the reader's for a while after they drag it: somebody who
    // scrolled down to read a later translation must not be yanked back every
    // time the singing advances.
    if (Date.now() - draggedAt.current < READER_HOLD_MS) return;

    scrolledTo.current = verseId;
    scroller.current?.scrollTo({
      y: Math.max(0, top - viewportHeight.current / 2),
      animated: true,
    });
  }, []);

  useEffect(() => {
    scrollToAnchor(anchorId);
  }, [anchorId, scrollToAnchor]);

  const rememberLine = useCallback(
    (verseId: number, y: number) => {
      lineTops.current[verseId] = y;
      // The layout that finally makes the opening scroll possible.
      if (verseId === anchorId) scrollToAnchor(verseId);
    },
    [anchorId, scrollToAnchor]
  );

  if (!current) {
    return (
      <Screen className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Nothing playing.</Text>
      </Screen>
    );
  }

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <Screen edges={['top', 'bottom']} className="bg-background">
      <View className="flex-row items-center px-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Close"
          className="size-10 items-center justify-center"
        >
          <ChevronDown size={22} color={colors.foreground} />
        </Pressable>
      </View>

      <View className="flex-row items-center gap-3 px-4 pb-3">
        <ArtTile
          name={current.artist ?? current.title}
          src={artistPhotoUrl(current.artistPhoto)}
          size={56}
          rounded={10}
        />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-medium text-foreground">
            {current.title}
          </Text>
          <Text numberOfLines={1} className="text-sm text-muted-foreground">
            {current.subtitle ?? current.artist}
          </Text>
          {current.isLive ? (
            <Badge variant="secondary" className="self-start">
              <UIText className="text-primary">LIVE</UIText>
            </Badge>
          ) : null}
        </View>

        {/* A broadcast is not something to save — there is no rendition behind it. */}
        {current.isLive ? null : (
          <Pressable
            onPress={() => favorites.toggle(current.id)}
            accessibilityLabel={
              favorites.has(current.id)
                ? `Remove ${current.title} from saved`
                : `Save ${current.title}`
            }
            hitSlop={8}
            className="size-10 items-center justify-center"
          >
            <Heart
              size={20}
              color={favorites.has(current.id) ? colors.primary : colors.mutedForeground}
              fill={favorites.has(current.id) ? colors.primary : 'transparent'}
            />
          </Pressable>
        )}
      </View>

      <View className="flex-row gap-2 px-4 pb-2">
        {(['lyrics', 'queue'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            className={
              tab === value
                ? 'flex-1 items-center rounded-lg bg-muted py-2'
                : 'flex-1 items-center rounded-lg py-2'
            }
          >
            <Text
              className={tab === value ? 'text-sm text-primary' : 'text-sm text-muted-foreground'}
            >
              {value === 'lyrics' ? 'Read along' : 'Up next'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scroller}
        onScrollBeginDrag={() => {
          draggedAt.current = Date.now();
        }}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        className="flex-1 px-4"
      >
        {tab === 'queue' ? (
          <QueueList />
        ) : (
          <>
            {!shabadId ? (
              <View className="gap-3 py-4">
                <Text className="text-sm text-muted-foreground">
                  {current.isLive
                    ? 'Nothing is tagged on a live broadcast — search for the line you are hearing.'
                    : 'No shabad linked to this rendition yet — search for the line you are hearing.'}
                </Text>
                <ShabadSearch onSelect={setLookedUp} />
              </View>
            ) : null}

            {/* A looked-up shabad is the listener's guess, not a tag. */}
            {!current.shabadId && lookedUp ? (
              <Text className="pb-2 text-xs text-muted-foreground">
                You looked this up — it is not tagged to this recording.
              </Text>
            ) : null}

            {query.isLoading ? (
              <Text className="py-6 text-center text-sm text-muted-foreground">
                Loading the shabad…
              </Text>
            ) : null}

            <View className="gap-1.5 pb-4">
              {lines.map((line) => (
                <ReadAlongLine
                  key={line.verseId}
                  gurmukhi={line.verse?.unicode ?? line.verse?.gurmukhi ?? ''}
                  translation={line.translation?.en?.bdb}
                  lit={line.verseId === lit}
                  onLayout={(e) => rememberLine(line.verseId, e.nativeEvent.layout.y)}
                />
              ))}
            </View>

            {/* Said once, at the foot, so nobody reads a static highlight as a bug. */}
            {lines.length && !isAligned(current) ? (
              <Text className="pb-6 text-center text-xs text-muted-foreground">
                This rendition has no line timings yet — the highlight is the tagged line.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <View className="gap-3 border-t border-border px-4 pb-4 pt-3">
        {/* A broadcast has no timeline to scrub, and it already says LIVE beside
            the title. Nothing is drawn rather than an inert track: a greyed-out
            bar still claims there is a length to be part-way through. */}
        {/* A broadcast has no timeline to scrub, and it already says LIVE beside
            the title. Nothing is drawn rather than an inert track: a greyed-out
            bar still claims there is a length to be part-way through. */}
        {current.isLive ? null : (
          <SeekBar current={current} position={position} duration={duration} />
        )}

        <View className="flex-row items-center justify-center gap-4">
          <Pressable
            onPress={playerActions.previous}
            disabled={current.isLive}
            accessibilityLabel="Previous"
            className="size-12 items-center justify-center"
          >
            <SkipBack
              size={22}
              color={current.isLive ? colors.mutedForeground : colors.foreground}
            />
          </Pressable>

          <Pressable
            onPress={playerActions.toggle}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            className="size-16 items-center justify-center rounded-full bg-primary"
          >
            {playing ? (
              <Pause size={26} color={colors.primaryForeground} />
            ) : (
              <Play size={26} color={colors.primaryForeground} />
            )}
          </Pressable>

          <Pressable
            onPress={() => void skipToNext()}
            disabled={current.isLive}
            accessibilityLabel="Next"
            className="size-12 items-center justify-center"
          >
            <SkipForward
              size={22}
              color={current.isLive ? colors.mutedForeground : colors.foreground}
            />
          </Pressable>

          <Pressable
            onPress={playerActions.cycleRepeat}
            // The name states what is on, not what a press would do — a cycle
            // of three has no single "would do".
            accessibilityLabel={REPEAT_LABELS[repeat]}
            className="size-12 items-center justify-center"
          >
            <RepeatIcon
              size={20}
              color={repeat === 'off' ? colors.mutedForeground : colors.primary}
            />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

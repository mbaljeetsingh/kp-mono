/**
 * The full player.
 *
 * What you scan sits at the top; what you touch sits at the bottom. The
 * transport is pinned below the scrolling text for the reason every music app
 * puts it there: the bottom third of a phone is where a thumb already rests.
 */
import { colors } from '@kp/tokens/colors';
import { useShabadText } from '@kp/api';
import { artworkFor, clock, highlightVerseId, isAligned, REPEAT_LABELS } from '@kp/core';
import { LinearGradient } from 'expo-linear-gradient';
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
  const [pick, setPick] = useState<{ trackId: string; shabadId: number } | null>(null);

  // Paired with the track it was chosen for rather than cleared by an effect,
  // which ran a render *after* the new track arrived and so showed the previous
  // track's shabad for a frame on every skip.
  const lookedUp = pick && pick.trackId === current?.id ? pick.shabadId : null;

  // The measured line tops belong to the shabad that was on screen, so a new
  // track invalidates them. Refs only — nothing here renders.
  useEffect(() => {
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
  // Where the block of lines starts inside the scroll content. Each line
  // reports its offset within that block, not within the scroll view, and a
  // notice above the block shifts the whole shabad down by its height.
  const linesTop = useRef(0);
  const viewportHeight = useRef(0);

  /**
   * The panel is the reader's once they drag it — for a while. Somebody who
   * scrolled down to read a later translation must not be yanked back every
   * time the singing advances. On an aligned rendition the hold is a pause,
   * not a hand-over: when it lapses the reader returns to the sung line on its
   * own, so the lit line is never left off-screen while the singing carries on.
   */
  const READER_HOLD_MS = 8000;
  const draggedAt = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Falls back to the tagger's anchor when nothing is being sung, so opening
  // mid-alaap still lands on the refrain rather than the top of the shabad.
  const anchorId = lit ?? current?.mainVerseId ?? null;

  // Read inside the hold timer, which outlives the render that armed it.
  const anchorRef = useRef<number | null>(null);
  const following = useRef(false);
  // A property of the rendition, not of this instant. Timings are sparse on
  // purpose — a gap is alaap, instrumental or katha — so `lit` is null for
  // minutes at a stretch, and gating on it meant a hold that happened to lapse
  // during an alaap turned the pause into a hand-over.
  const aligned = Boolean(current && isAligned(current));
  useEffect(() => {
    anchorRef.current = anchorId;
    following.current = aligned;
  }, [anchorId, aligned]);

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

    // Written here rather than held in state: which line we last scrolled to is
    // not something that renders, and making it state would re-render the whole
    // reader on every scroll. The compiler rule flags it because the effect
    // above clears the same ref on a track change.
    // eslint-disable-next-line react-hooks/immutability
    scrolledTo.current = verseId;
    scroller.current?.scrollTo({
      y: Math.max(0, linesTop.current + top - viewportHeight.current / 2),
      animated: true,
    });
  }, []);

  const onReaderDrag = useCallback(() => {
    draggedAt.current = Date.now();
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (!following.current) return;
      // The hold is over; forget both the drag and the last scroll target so
      // the sung line is centred again even if it has not changed since.
      draggedAt.current = 0;
      scrolledTo.current = null;
      scrollToAnchor(anchorRef.current);
    }, READER_HOLD_MS);
  }, [scrollToAnchor]);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    []
  );

  useEffect(() => {
    scrollToAnchor(anchorId);
  }, [anchorId, scrollToAnchor]);

  const rememberLine = useCallback(
    (verseId: number, y: number) => {
      // Measured layout, not rendered state — same reasoning as scrolledTo.
      // eslint-disable-next-line react-hooks/immutability
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
  // The tile's leading colour, so the screen and the art agree.
  const glow = artworkFor(current.artist ?? current.title).colors[0];

  return (
    <Screen edges={['top', 'bottom']} className="bg-background">
      {/* The screen takes its cast from the ragi: the same hue the art tile is
          drawn in, washed across the top and gone by the transport. Photos do
          not carry a colour we can read cheaply, so the tile's gradient stands
          in for both. */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${glow}4d`, `${glow}00`]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360 }}
      />

      <View className="flex-row items-center justify-between px-2 pt-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Close"
          className="size-11 items-center justify-center"
        >
          <ChevronDown size={24} color={colors.foreground} />
        </Pressable>
        <Text className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Now playing
        </Text>
        <View className="size-11" />
      </View>

      <View className="flex-row items-center gap-4 px-5 pb-4 pt-3">
        <ArtTile
          name={current.artist ?? current.title}
          src={artistPhotoUrl(current.artistPhoto)}
          size={112}
          rounded={16}
        />
        <View className="min-w-0 flex-1 gap-1.5">
          <Text numberOfLines={2} className="font-display text-2xl leading-7 text-foreground">
            {current.title}
          </Text>
          <Text numberOfLines={1} className="text-[15px] text-muted-foreground">
            {current.subtitle ?? current.artist}
          </Text>
          {current.isLive ? (
            /* Card, not the gold tint the raag chip takes: live red on that
               tint is 3.9:1, under the floor the palette holds itself to. An
               opaque surface also blocks the gradient above, so the figure
               does not move with whichever ragi is playing. */
            <View className="self-start rounded-md bg-card px-2 py-0.5">
              <Text className="text-xs font-semibold text-live">LIVE</Text>
            </View>
          ) : current.raag ? (
            <View className="self-start rounded-md bg-primary-soft px-2 py-0.5">
              <Text className="text-xs font-semibold text-primary">{current.raag}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="mx-5 mb-2 flex-row rounded-xl bg-card p-[3px]">
        {(['lyrics', 'queue'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            className={
              tab === value
                ? 'flex-1 items-center rounded-[9px] bg-secondary py-2'
                : 'flex-1 items-center rounded-[9px] py-2'
            }
          >
            <Text
              className={
                tab === value
                  ? 'text-sm font-semibold text-foreground'
                  : 'text-sm font-medium text-muted-foreground'
              }
            >
              {value === 'lyrics' ? 'Read along' : 'Up next'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scroller}
        onScrollBeginDrag={onReaderDrag}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        className="flex-1 px-5"
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
                <ShabadSearch
                  onSelect={(chosen) => setPick({ trackId: current.id, shabadId: chosen })}
                />
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

            <View
              className="gap-1 pb-4"
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                if (y === linesTop.current) return;
                /*
                 * Aim again whenever the block moves.
                 *
                 * The notices above it unmount in the same commit the lines
                 * mount — "Loading the shabad…" is the usual one — and a line
                 * reports its own offset before its parent reports theirs. So
                 * the opening scroll is computed against the previous offset
                 * and then latched by `scrolledTo`, leaving the shabad short by
                 * the height of a notice that is no longer there. On an
                 * unaligned rendition the anchor never changes again, so
                 * nothing would correct it.
                 */
                linesTop.current = y;
                // eslint-disable-next-line react-hooks/immutability
                scrolledTo.current = null;
                scrollToAnchor(anchorId);
              }}
            >
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

      <View className="gap-4 px-5 pb-4 pt-3">
        {/* A broadcast has no timeline to scrub, and it already says LIVE beside
            the title. Nothing is drawn rather than an inert track: a greyed-out
            bar still claims there is a length to be part-way through. */}
        {current.isLive ? null : (
          <SeekBar current={current} position={position} duration={duration} />
        )}

        {/* The heart belongs down here with the transport, not up beside the
            title: saving a shabad is something you do while listening to it,
            and the title sits at the top of a full-height screen while the
            thumb is here. Inset absolutely rather than given a slot in the
            row, so the transport stays centred where it has always been.
            A broadcast is not something to save — there is no rendition
            behind it. */}
        <View className="relative flex-row items-center justify-center gap-5">
          {current.isLive ? null : (
            <Pressable
              onPress={() => favorites.toggle(current.id)}
              accessibilityLabel={
                favorites.has(current.id)
                  ? `Remove ${current.title} from saved`
                  : `Save ${current.title}`
              }
              className="absolute bottom-0 left-0 top-0 w-14 items-center justify-center"
            >
              <Heart
                size={26}
                color={favorites.has(current.id) ? colors.primary : colors.subtleForeground}
                fill={favorites.has(current.id) ? colors.primary : 'transparent'}
              />
            </Pressable>
          )}

          {/* Repeat hangs off the right with nothing to answer it on the left,
              so the middle of this row is not the play button — it sits half a
              button to the left of it, under a seek bar that is centred. An
              empty slot the size of repeat puts it back in the middle. */}
          <View className="w-12" />

          <Pressable
            onPress={playerActions.previous}
            disabled={current.isLive}
            accessibilityLabel="Previous"
            className="size-14 items-center justify-center"
          >
            <SkipBack
              size={30}
              color={current.isLive ? colors.subtleForeground : colors.foreground}
              fill={current.isLive ? colors.subtleForeground : colors.foreground}
            />
          </Pressable>

          <Pressable
            onPress={playerActions.toggle}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            className="size-[72px] items-center justify-center rounded-full bg-primary active:opacity-90"
          >
            {playing ? (
              <Pause size={30} color={colors.primaryForeground} fill={colors.primaryForeground} />
            ) : (
              <Play size={30} color={colors.primaryForeground} fill={colors.primaryForeground} />
            )}
          </Pressable>

          <Pressable
            onPress={() => void skipToNext()}
            disabled={current.isLive}
            accessibilityLabel="Next"
            className="size-14 items-center justify-center"
          >
            <SkipForward
              size={30}
              color={current.isLive ? colors.subtleForeground : colors.foreground}
              fill={current.isLive ? colors.subtleForeground : colors.foreground}
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
              size={22}
              color={repeat === 'off' ? colors.subtleForeground : colors.primary}
            />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

/**
 * Read-along.
 *
 * Always the whole shabad, with the sung line lit and scrolled to. An aligned
 * rendition once opened on the sung line alone — a projector view — and it
 * read well but was the wrong default: a shabad is a poem you follow, so the
 * lines already sung and the ones coming are the context that makes the lit
 * one mean anything.
 */
import {
  clock,
  highlightVerseId,
  isAligned,
  segmentTotal,
  verseGurmukhi,
  type ReadAlongTextSize,
} from '@kp/core';
import { useOtherRecordings, useShabadText } from '@kp/api';
import { ShabadSearch } from '@kp/ui/app/shabad-search';
import { Button } from '@kp/ui/button';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { playerActions, usePlayer } from '~/lib/player';
import { BANIDB_BASE } from '~/lib/links';
import { supabase } from '~/lib/supabase';
import { useReadAlongOptions } from '~/lib/read-along-options';
import { cn } from '~/lib/utils';

const LINE_SIZE: Record<ReadAlongTextSize, string> = {
  small: 'text-base leading-7',
  medium: 'text-lg leading-8',
  large: 'text-2xl leading-10',
};

/**
 * The panel is the reader's once they scroll it — for a while.
 *
 * A listener who scrolled down to read a later translation must not be yanked
 * back to the sung line every time the singing advances. Wheel and touch mark
 * reader intent — `scroll` would also fire for our own scrollTo. But on an
 * aligned rendition the hold is a pause, not a hand-over: when it lapses the
 * panel returns to the sung line on its own, so the lit line is never left
 * somewhere off-screen while the singing carries on.
 */
const READER_HOLD_MS = 8000;

export function LyricsPanel({ className }: { className?: string }) {
  const current = usePlayer((s) => s.current);
  const position = usePlayer((s) => s.position);
  const [options] = useReadAlongOptions();

  /**
   * A shabad the listener looked up themselves.
   *
   * Most of the archive is untagged and a broadcast is never tagged at all, so
   * the panel would otherwise be a dead end exactly when somebody most wants it
   * — they are hearing a line right now and want to read along. Cleared when
   * the track changes, because it was chosen for that track.
   */
  const [pick, setPick] = useState<{ trackId: string; shabadId: number } | null>(null);

  // Paired with the track it was chosen for, rather than cleared by an effect
  // on `current?.id`. The effect ran a render *after* the new track arrived, so
  // the panel showed the previous track's shabad for a frame on every skip.
  const lookedUp = pick && pick.trackId === current?.id ? pick.shabadId : null;

  const shabadId = current?.shabadId ?? lookedUp;
  const query = useShabadText(BANIDB_BASE, shabadId);
  const lines = query.data?.verses ?? [];
  // Only a rendition's own tag: a looked-up shabad is the listener's guess, and
  // the archive should not vouch for it by offering recordings of it.
  const others = useOtherRecordings(supabase, current?.shabadId, current?.id).data ?? [];

  // Timings belong to the tagged rendition, so a looked-up shabad lights
  // nothing — there is nothing aligning it to this audio.
  const lit = current?.shabadId ? highlightVerseId(current, position) : null;

  /**
   * Where the scroll goes. Falls back to the tagger's anchor when nothing is
   * being sung: opening mid-alaap on an aligned rendition must still position
   * the reader at the refrain rather than the top of the shabad. The visual
   * highlight stays `lit` alone — a gap lights nothing.
   */
  const anchorId = lit ?? current?.mainVerseId ?? null;

  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLParagraphElement | null>(null);
  const readerScrolledAt = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read inside the timer, which outlives the render that armed it.
  const following = useRef(false);
  // A property of the rendition, not of this instant. Timings are sparse on
  // purpose — a gap is alaap, instrumental or katha — so `lit` is null for
  // minutes at a stretch, and gating on it meant a hold that happened to lapse
  // during an alaap turned the pause into a hand-over.
  const aligned = Boolean(current && isAligned(current));
  useEffect(() => {
    following.current = aligned;
  }, [aligned]);

  const follow = useCallback(() => {
    const box = panel.current;
    const line = anchor.current;
    if (!box || !line) return;

    // Aimed at the panel rather than `scrollIntoView`, which walks every
    // scrollable ancestor — inside the phone sheet that scrolled the sheet
    // itself, carrying the artwork and the transport off the top of the screen.
    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  const markReaderIntent = useCallback(() => {
    readerScrolledAt.current = Date.now();
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (following.current) follow();
    }, READER_HOLD_MS);
  }, [follow]);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    []
  );

  // `lines.length` too: the anchor is often known before BaniDB has answered,
  // and an effect keyed on the anchor alone would fire once, find no element,
  // and not run again until the singing moved on. `options` because every one
  // of them changes how tall the lines are, which moves the sung line away.
  useEffect(() => {
    if (anchorId == null) return;
    if (Date.now() - readerScrolledAt.current < READER_HOLD_MS) return;
    follow();
  }, [anchorId, lines.length, options, follow]);

  if (!shabadId) {
    return (
      <div className={cn('flex flex-col gap-3 overflow-y-auto p-4', className)}>
        <p className="text-sm text-muted-foreground">
          {current?.isLive
            ? 'Nothing is tagged on a live broadcast — search for the line you are hearing.'
            : 'No shabad linked to this rendition yet. Search for the line you are hearing.'}
        </p>
        <ShabadSearch
          base={BANIDB_BASE}
          onSelect={(chosen) =>
            current && setPick({ trackId: current.id, shabadId: chosen.shabadId })
          }
        />
      </div>
    );
  }

  return (
    <div
      ref={panel}
      onWheel={markReaderIntent}
      onTouchMove={markReaderIntent}
      className={cn('relative overflow-y-auto px-4 py-3', className)}
    >
      {/* A looked-up shabad is the listener's guess, not a tag — labelled so
          nobody reads it as something the archive asserts. */}
      {!current?.shabadId && lookedUp ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2">
          <p className="flex-1 text-xs text-muted-foreground">
            You looked this up — it is not tagged to this recording.
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear the looked-up shabad"
            onClick={() => setPick(null)}
          >
            <X />
          </Button>
        </div>
      ) : null}

      {query.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading the shabad…</p>
      ) : null}

      {query.isError ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Could not reach BaniDB for this shabad.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {lines.map((line) => {
          const isLit = line.verseId === lit;
          return (
            <p
              key={line.verseId}
              ref={line.verseId === anchorId ? anchor : undefined}
              className={cn(
                // The edge is on every line, transparent, so lighting one never
                // shifts the text beside it.
                'rounded-r-md border-l-2 px-3 py-1.5 font-gurbani text-verse transition-colors',
                LINE_SIZE[options.textSize],
                // Larivaar has no spaces to wrap at, and a whole line is wider
                // than the panel.
                options.larivaar && 'wrap-anywhere',
                isLit
                  ? 'border-highlight bg-linear-to-r from-verse-active-from to-verse-active-to font-semibold'
                  : 'border-transparent'
              )}
            >
              {verseGurmukhi(line, options)}
              {options.transliteration && line.transliteration?.english ? (
                <span
                  className={cn(
                    'mt-0.5 block font-sans text-xs italic',
                    isLit ? 'text-muted-foreground' : 'text-verse-translation'
                  )}
                >
                  {line.transliteration.english}
                </span>
              ) : null}
              {line.translation?.en?.bdb ? (
                <span
                  className={cn(
                    'mt-0.5 block font-sans text-xs',
                    // verse-translation is 3.8:1 on the lit line's blue.
                    isLit ? 'text-muted-foreground' : 'text-verse-translation'
                  )}
                >
                  {line.translation.en.bdb}
                </span>
              ) : null}
            </p>
          );
        })}
      </div>

      {/* Unaligned renditions hold the tagger's line rather than following the
          singing. Said once, at the foot, so nobody reads the static highlight
          as a bug. */}
      {lines.length && !isAligned(current) ? (
        <p className="py-4 text-center text-xs text-muted-foreground/60">
          This rendition has no line timings yet — the highlight is the tagged line.
        </p>
      ) : null}

      {/* At the foot, because the words come first. Appended to the queue rather
          than replacing it: this is a detour from what the listener had lined up. */}
      {others.length ? (
        <section className="mt-4 border-t border-border pt-3">
          <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Also sung by</h3>
          {others.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => playerActions.play(item, false)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent/50"
            >
              <span className="min-w-0 truncate">{item.subtitle ?? item.artist ?? item.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {clock(segmentTotal(item, 0))}
              </span>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

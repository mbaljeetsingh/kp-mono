/**
 * Read-along.
 *
 * Always the whole shabad, with the sung line lit and scrolled to. An aligned
 * rendition once opened on the sung line alone — a projector view — and it
 * read well but was the wrong default: a shabad is a poem you follow, so the
 * lines already sung and the ones coming are the context that makes the lit
 * one mean anything.
 */
import { highlightVerseId, isAligned } from '@kp/core';
import { useShabadText } from '@kp/api';
import { ShabadSearch } from '@kp/ui/app/shabad-search';
import { Button } from '@kp/ui/button';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePlayer } from '~/lib/player';
import { BANIDB_BASE } from '~/lib/links';
import { cn } from '~/lib/utils';

/**
 * The panel is the reader's once they scroll it.
 *
 * A listener who scrolled down to read a later translation must not be yanked
 * back to the sung line every time the singing advances. Wheel and touch mark
 * reader intent — `scroll` would also fire for our own scrollIntoView.
 */
const READER_HOLD_MS = 8000;

export function LyricsPanel({ className }: { className?: string }) {
  const current = usePlayer((s) => s.current);
  const position = usePlayer((s) => s.position);

  /**
   * A shabad the listener looked up themselves.
   *
   * Most of the archive is untagged and a broadcast is never tagged at all, so
   * the panel would otherwise be a dead end exactly when somebody most wants it
   * — they are hearing a line right now and want to read along. Cleared when
   * the track changes, because it was chosen for that track.
   */
  const [lookedUp, setLookedUp] = useState<number | null>(null);
  useEffect(() => setLookedUp(null), [current?.id]);

  const shabadId = current?.shabadId ?? lookedUp;
  const query = useShabadText(BANIDB_BASE, shabadId);
  const lines = query.data?.verses ?? [];

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

  const markReaderIntent = useCallback(() => {
    readerScrolledAt.current = Date.now();
  }, []);

  useEffect(() => {
    const box = panel.current;
    const line = anchor.current;
    if (anchorId == null || !box || !line) return;
    if (Date.now() - readerScrolledAt.current < READER_HOLD_MS) return;

    // Aimed at the panel rather than `scrollIntoView`, which walks every
    // scrollable ancestor — inside the phone sheet that scrolled the sheet
    // itself, carrying the artwork and the transport off the top of the screen.
    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [anchorId]);

  if (!shabadId) {
    return (
      <div className={cn('flex flex-col gap-3 overflow-y-auto p-4', className)}>
        <p className="text-sm text-muted-foreground">
          {current?.isLive
            ? 'Nothing is tagged on a live broadcast — search for the line you are hearing.'
            : 'No shabad linked to this rendition yet. Search for the line you are hearing.'}
        </p>
        <ShabadSearch base={BANIDB_BASE} onSelect={(pick) => setLookedUp(pick.shabadId)} />
      </div>
    );
  }

  return (
    <div
      ref={panel}
      onWheel={markReaderIntent}
      onTouchMove={markReaderIntent}
      className={cn('overflow-y-auto px-4 py-3', className)}
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
            onClick={() => setLookedUp(null)}
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
                'text-base leading-relaxed transition-colors',
                isLit ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {line.verse?.unicode ?? line.verse?.gurmukhi ?? ''}
              {line.translation?.en?.bdb ? (
                <span className="mt-0.5 block text-xs text-muted-foreground/70">
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
    </div>
  );
}

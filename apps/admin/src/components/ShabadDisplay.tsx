/**
 * The linked shabad's lines, so the tagger can choose the anchor.
 *
 * People recognise a kirtan rendition by its rahao — the refrain the ragi
 * returns to — not by the shabad's first line, which is why `main_verse_id`
 * exists at all and why it is worth a click rather than a default.
 *
 * The line searched for and clicked is pre-selected, because that is what the
 * tagger was looking for; every other line is one click away here.
 *
 * The whole verse goes back up, not just its id: picking a line is a statement
 * about which line this rendition is known by, and the form has to be able to
 * rename itself and retitle the linked-shabad pill from it. Handing back a bare
 * number left both showing the line that was *searched* long after another had
 * been chosen, which read as the click having done nothing.
 */
import { type ShabadVerse, useShabadText } from '@kp/api';
import { Pin } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { BANIDB_BASE } from '~/lib/links';
import { cn } from '~/lib/utils';

export function ShabadDisplay({
  shabadId,
  mainVerseId,
  onPick,
}: {
  shabadId: number;
  mainVerseId: number | null;
  /** Absent for someone who may not change the row: the lines read, the pin shows, nothing clicks. */
  onPick?: (verse: ShabadVerse) => void;
}) {
  const query = useShabadText(BANIDB_BASE, shabadId);
  const lines = query.data?.verses ?? [];
  const box = useRef<HTMLDivElement>(null);
  const loaded = lines.length > 0;

  /*
   * The main verse in view when the lines arrive. It is often the rahao, a few
   * lines down a box that shows four, so it opened scrolled past — the one line
   * the panel is about, out of sight. On arrival only, and only when it is out
   * of view: run again on a click that changed it, it pulled the line just
   * clicked to the top, out from under the pointer. The box scrolls, never the
   * page: the player above it is sticky.
   */
  useEffect(() => {
    const el = box.current;
    const pin = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !pin) return;
    const top = pin.offsetTop - el.offsetTop;
    if (top < el.scrollTop || top + pin.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top - 8;
    }
  }, [loaded, shabadId]);

  if (query.isLoading) {
    return <p className="px-1 py-2 text-sm text-muted-foreground">Loading the shabad…</p>;
  }

  if (query.isError) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">
        Could not reach BaniDB — the link is saved either way.
      </p>
    );
  }

  return (
    <div
      ref={box}
      className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-2"
    >
      {lines.map((line) => {
        const picked = line.verseId === mainVerseId;
        return (
          /*
           * A plain button rather than the shared one, as the search results
           * are: the ghost variant's `hover:bg-muted` is emitted after any
           * background set here, so the chosen line lost its tint under the
           * pointer that had just chosen it — the one moment it most needed to
           * be visible. The pin carries the state anyway, so hover cannot hide
           * it at all.
           */
          <button
            key={line.verseId}
            type="button"
            aria-pressed={picked}
            disabled={!onPick}
            title={picked ? 'The main verse' : onPick ? 'Set as the main verse' : undefined}
            onClick={() => onPick?.(line)}
            className={cn(
              'flex items-start gap-2 rounded-md px-2 py-1.5 text-left enabled:hover:bg-accent/50',
              picked && 'bg-primary/10 enabled:hover:bg-primary/15'
            )}
          >
            <Pin
              className={cn('mt-1 size-3 shrink-0', picked ? 'text-primary' : 'text-transparent')}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn('font-gurbani text-base', picked && 'font-semibold text-primary')}
              >
                {line.verse?.unicode ?? line.verse?.gurmukhi ?? ''}
              </span>
              {line.transliteration?.english ? (
                <span className="text-xs text-muted-foreground">
                  {line.transliteration.english}
                </span>
              ) : null}
              {line.translation?.en?.bdb ? (
                <span className="text-xs text-muted-foreground/70">{line.translation.en.bdb}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

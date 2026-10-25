/**
 * Under the player: which shabad a segment is, in the two shapes that
 * question takes.
 *
 * Picking — a new cut has just been ended, or a segment's shabad is being
 * changed: a BaniDB search, and for a new cut a name typed by ear instead,
 * which keeps tagging open to anyone without Gurbani literacy. Reading — the
 * strip's segment has a shabad: its lines, and a click on one makes it the
 * line the segment is known by.
 *
 * This replaces the form that sat on the page whether or not anything needed
 * it. Its edges are the strip's now, its Save the strip's, and what was left —
 * the shabad and the line — is all this panel holds.
 */
import { type BaniDbHit, type ShabadVerse } from '@kp/api';
import { titlesFor, type RenditionTitles } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { ShabadSearch } from '@kp/ui/app/shabad-search';
import { useEffect, useRef, useState } from 'react';

import { ShabadDisplay } from '~/components/ShabadDisplay';
import { BANIDB_BASE } from '~/lib/links';

/** A shabad and the line a rendition is titled from, ready to write. */
export interface ShabadLink {
  shabadId: number;
  verseId: number | null;
  titles: RenditionTitles;
}

/**
 * The line they searched for and clicked is the anchor: people recognise a
 * rendition by its rahao, not its first line, and the line typed is the one
 * they heard.
 */
export function linkFromHit(hit: BaniDbHit): ShabadLink {
  return {
    shabadId: hit.shabadId,
    verseId: typeof hit.verseId === 'number' ? hit.verseId : null,
    titles: titlesFor(hit, hit.shabadId),
  };
}

export function linkFromVerse(shabadId: number, verse: ShabadVerse): ShabadLink {
  return { shabadId, verseId: verse.verseId, titles: titlesFor(verse, shabadId) };
}

export function ShabadPicker({
  title,
  warning = null,
  seedName,
  busy,
  onPick,
  onByEar,
  onCancel,
}: {
  title: string;
  /** Said under the title, never a block: an overlap with a neighbour. */
  warning?: string | null;
  /** A starting name, from a scan pointer — offered by ear, never as a link. */
  seedName?: string;
  busy: boolean;
  onPick: (link: ShabadLink) => void;
  /**
   * Save named by ear instead. Only for a new cut: a segment being re-linked
   * already has a name, so the field is there exactly when this is given.
   */
  onByEar?: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(seedName ?? '');
  const box = useRef<HTMLElement>(null);
  // Typed into straight away: `]` ends the cut and the next keys are the
  // shabad's first letters. Without scrolling — the panel is just below the
  // player, and the page scrolls it into view itself.
  useEffect(() => {
    box.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={box}
      aria-label="Which shabad"
      className="flex flex-col gap-3 rounded-xl border border-primary/40 p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
          Cancel
        </Button>
      </div>
      {warning ? <p className="-mt-1 text-xs text-muted-foreground">{warning}</p> : null}
      <ShabadSearch base={BANIDB_BASE} onSelect={(hit) => onPick(linkFromHit(hit))} />
      {onByEar ? (
        <form
          className="flex flex-wrap items-center gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !busy) onByEar(name.trim());
          }}
        >
          <label htmlFor="by-ear" className="text-xs text-muted-foreground">
            Don’t know it? Name it by ear
          </label>
          <Input
            id="by-ear"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What you hear"
            className="h-8 min-w-48 flex-1"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!name.trim() || busy}>
            Save draft
          </Button>
        </form>
      ) : null}
    </section>
  );
}

export function LyricsPanel({
  shabadId,
  mainVerseId,
  raag,
  taal,
  editable,
  busy,
  onPickLine,
  onSaveMore,
  onChangeShabad,
}: {
  shabadId: number;
  mainVerseId: number | null;
  raag: string;
  taal: string;
  editable: boolean;
  busy: boolean;
  onPickLine: (link: ShabadLink) => void;
  onSaveMore: (more: { raag: string; taal: string }) => void;
  onChangeShabad: () => void;
}) {
  // Seeded once: the page keys this panel on the row, so another row remounts it.
  const [moreRaag, setMoreRaag] = useState(raag);
  const [moreTaal, setMoreTaal] = useState(taal);
  const changed = moreRaag.trim() !== raag.trim() || moreTaal.trim() !== taal.trim();
  return (
    <section aria-label="Lyrics" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {editable
            ? mainVerseId == null
              ? 'Click the line it’s known by — it names the segment, and publishing needs it.'
              : 'Click another line to name it by that one.'
            : 'Lyrics'}
        </p>
        {editable ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onChangeShabad}
            className="text-xs text-muted-foreground"
          >
            Change shabad
          </Button>
        ) : null}
      </div>
      <ShabadDisplay
        shabadId={shabadId}
        mainVerseId={mainVerseId}
        onPick={editable ? (verse) => onPickLine(linkFromVerse(shabadId, verse)) : undefined}
      />
      {/* Optional by design: neither gates publishing, and most taggers skip
          them. Raag shows up in the player's search and rows. */}
      {editable ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            More · raag, taal{raag || taal ? `: ${[raag, taal].filter(Boolean).join(', ')}` : ''}
          </summary>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (changed && !busy) onSaveMore({ raag: moreRaag, taal: moreTaal });
            }}
          >
            <Input
              aria-label="Raag"
              value={moreRaag}
              onChange={(e) => setMoreRaag(e.target.value)}
              placeholder="Raag, e.g. Asa"
              className="h-8 w-48"
            />
            <Input
              aria-label="Taal"
              value={moreTaal}
              onChange={(e) => setMoreTaal(e.target.value)}
              placeholder="Taal, e.g. Teentaal"
              className="h-8 w-48"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!changed || busy}>
              Save
            </Button>
          </form>
        </details>
      ) : null}
    </section>
  );
}

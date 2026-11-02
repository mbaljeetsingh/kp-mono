/**
 * Search BaniDB for a line.
 *
 * Shared by the workbench, where it links a shabad to a rendition, and by the
 * player's read-along, where a listener on a live broadcast can look up what
 * they are hearing. The player has a header language to follow, passed as
 * `script`; the workbench has none, so it keeps its own toggle.
 *
 * Typing is GurbaniLipi. The field keeps raw keystrokes and renders them in the
 * GurbaniLipi font, so `mdmA` shows as ਮਦਮਅ while the query still holds the
 * ASCII BaniDB's first-letter search wants. There is no transliteration step,
 * which is the point: nothing can disagree about what was typed, the caret
 * never jumps, and paste, backspace and selection behave like a normal input
 * because it is one.
 */
import {
  LANGUAGE_SEARCH_TYPE,
  lineDetails,
  lineSegments,
  lineTextIn,
  MIN_FIRST_LETTERS,
  SEARCH_TYPES,
  useFirstLetterLines,
  type BaniDbHit,
  type LineSegment,
} from '@kp/api';
import * as React from 'react';
import { useLocalStorage } from 'usehooks-ts';

import { Button } from '../ui/button';
import { ShabadInput } from './shabad-input';
import { cn } from '../../lib/utils';

/**
 * The line picked: BaniDB's own hit, whole. A caller that titles it (the
 * workbench) then reads it exactly as it reads a filename match, which is the
 * same hit from the same search — a flattened copy was a second way to turn
 * one line into a title, free to drift from the first.
 */
export type ShabadPick = BaniDbHit;

/** A line with the words the letters landed on picked out. */
function Marked({ parts }: { parts: LineSegment[] }) {
  return parts.map((part, i) =>
    part.match ? (
      <mark key={i} className="bg-transparent font-semibold text-primary">
        {part.text}
      </mark>
    ) : (
      part.text
    )
  );
}

export function ShabadSearch({
  base,
  onSelect,
  placeholder = 'Type the first letters…',
  script,
  className,
}: {
  base: string;
  /** Fixes the search's language, and takes the toggle away. */
  script?: 'en' | 'pa';
  onSelect: (pick: ShabadPick) => void;
  placeholder?: string;
  className?: string;
}) {
  const [chosen, setChosen] = useLocalStorage<number>('kp:shabad-lang', 0);
  const lang = script ?? (chosen === LANGUAGE_SEARCH_TYPE.en ? 'en' : 'pa');
  const [term, setTerm] = React.useState('');

  const query = useFirstLetterLines(base, term, lang);
  const hits = query.data ?? [];

  // English search is a different alphabet, so it drops the font and reads as
  // roman.
  const gurbaniLipi = lang === 'pa';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ShabadInput
        value={term}
        onChange={setTerm}
        gurbaniLipi={gurbaniLipi}
        placeholder={placeholder}
        ariaLabel="Search BaniDB"
      />

      {script === undefined ? (
        <div className="flex gap-1">
          {SEARCH_TYPES.map((type) => (
            <Button
              key={type.key}
              variant={chosen === type.key ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={chosen === type.key}
              onClick={() => setChosen(type.key)}
            >
              {type.label}
            </Button>
          ))}
        </div>
      ) : null}

      {query.isLoading ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>
      ) : null}

      {query.isError ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Could not reach BaniDB.</p>
      ) : null}

      {!query.isLoading &&
      !query.isError &&
      term.trim().length >= MIN_FIRST_LETTERS &&
      !hits.length ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Nothing matches.</p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {hits.map((hit: BaniDbHit) => (
          <button
            key={hit.verseId}
            type="button"
            // The line somebody searched for and clicked is a stronger signal
            // than any heuristic — they were looking for that line. It becomes
            // the anchor.
            onClick={() => onSelect(hit)}
            className="rounded-lg px-2 py-2 text-left hover:bg-accent/50"
          >
            <p className="text-sm">
              {lang === 'pa' ? (
                <Marked parts={lineSegments(lineTextIn(hit, 'pa'), term, 'pa')} />
              ) : (
                lineTextIn(hit, 'pa')
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === 'en' ? (
                <Marked parts={lineSegments(lineTextIn(hit, 'en'), term, 'en')} />
              ) : (
                lineTextIn(hit, 'en')
              )}
            </p>
            {lineDetails(hit) ? (
              <p className="text-[11px] text-muted-foreground/70">{lineDetails(hit)}</p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The linked shabad's lines, so the tagger can choose the anchor.
 *
 * People recognise a kirtan rendition by its rahao — the refrain the ragi
 * returns to — not by the shabad's first line, which is why `main_verse_id`
 * exists at all and why it is worth a click rather than a default.
 *
 * The line searched for and clicked is pre-selected, because that is what the
 * tagger was looking for; every other line is one click away here.
 */
import { useShabadText } from '@kp/api';
import { Button } from '@kp/ui/button';

import { BANIDB_BASE } from '~/lib/links';
import { cn } from '~/lib/utils';

export function ShabadDisplay({
  shabadId,
  mainVerseId,
  onPick,
}: {
  shabadId: number;
  mainVerseId: number | null;
  onPick: (verseId: number) => void;
}) {
  const query = useShabadText(BANIDB_BASE, shabadId);
  const lines = query.data?.verses ?? [];

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
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
      <p className="px-1 pb-1 text-xs text-muted-foreground">
        Pick the rahao — the line the ragi returns to.
      </p>

      {lines.map((line) => {
        const picked = line.verseId === mainVerseId;
        return (
          <Button
            key={line.verseId}
            variant="ghost"
            aria-pressed={picked}
            onClick={() => onPick(line.verseId)}
            className={cn(
              'h-auto justify-start whitespace-normal px-2 py-1.5 text-left',
              picked && 'bg-primary/15 text-primary'
            )}
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{line.verse?.unicode ?? line.verse?.gurmukhi ?? ''}</span>
              {line.translation?.en?.bdb ? (
                <span className="text-xs text-muted-foreground">{line.translation.en.bdb}</span>
              ) : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * What a finished cut does to the drafts lying mostly under it, said before its
 * shabad is picked — because picking the shabad is what saves it.
 *
 * Presentational: the page decides which rows are offered and does the deleting.
 */
import { clock } from '@kp/core';
import { Button } from '@kp/ui/button';
import { ButtonGroup } from '@kp/ui/button-group';

export interface CoveredDraft {
  id: string;
  name: string;
  start: number;
  end: number;
  whose: 'scan' | 'yours' | 'other';
}

const WHOSE = { scan: 'a scan draft', yours: 'your draft', other: 'someone else’s draft' };

export function CoveredChoice({
  covered,
  replace,
  onChange,
}: {
  covered: CoveredDraft[];
  replace: boolean;
  onChange: (replace: boolean) => void;
}) {
  const many = covered.length > 1;
  const scan = covered.filter((c) => c.whose === 'scan');
  /* Only a lone draft of your own gets the page's Undo: it holds one row. */
  const final = many || covered[0]?.whose !== 'yours';
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground">
      <p className="min-w-0 flex-[1_1_18rem]">
        Covers{' '}
        {covered.map((c, i) => (
          <span key={c.id}>
            {i ? ' and ' : ''}
            <span className="font-medium text-foreground">{c.name}</span>
            {many ? null : `, ${WHOSE[c.whose]} (${clock(c.start)}–${clock(c.end)})`}
          </span>
        ))}
        .{' '}
        {replace ? (
          <>
            {many ? 'They go' : 'It goes'} when this cut is saved
            {final ? ', and that cannot be undone' : ''}.
            {scan.length ? (
              <>
                {' '}
                The scan won’t suggest {many
                  ? scan.map((c) => c.name).join(' or ')
                  : 'that shabad'}{' '}
                here again — unless you pick the same one, and then its draft takes your edges.
              </>
            ) : null}
          </>
        ) : (
          <>{many ? 'All stay' : 'Both stay'}. The strip lets you switch between them.</>
        )}
      </p>
      <ButtonGroup aria-label="What happens to the covered drafts">
        <Button
          size="sm"
          variant={replace ? 'default' : 'outline'}
          aria-pressed={replace}
          onClick={() => onChange(true)}
        >
          {many ? 'Replace them' : 'Replace it'}
        </Button>
        <Button
          size="sm"
          variant={replace ? 'outline' : 'default'}
          aria-pressed={!replace}
          onClick={() => onChange(false)}
        >
          {many ? 'Keep all' : 'Keep both'}
        </Button>
      </ButtonGroup>
    </div>
  );
}

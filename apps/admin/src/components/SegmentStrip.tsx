/**
 * The row under the timeline: what the playhead is on, and the one thing to do
 * about it.
 *
 * Every segment action lives here once. They used to be spread over a row per
 * segment, a form and the bar's own buttons, so the same Publish sat in three
 * places and none of them was where the listening happens. The strip follows
 * the playhead (`stripSegment` in core), so listening to a shabad is already
 * having its actions in front of you.
 *
 * Presentational: the page owns the state and the writes, and tells the strip
 * which of its few shapes to take.
 */
import { clock } from '@kp/core';
import { Button } from '@kp/ui/button';
import { ButtonGroup } from '@kp/ui/button-group';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
} from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { Kbd } from '~/components/Kbd';
import { cn } from '~/lib/utils';

export type StripMode =
  | { kind: 'none' }
  | {
      kind: 'gap';
      start: number;
      end: number;
      /** A scan pointer the playhead is inside, uncovered: offered as the thing to tag. */
      pointer: { name: string } | null;
      /** This account may make segments; without it the gap has nothing to offer. */
      canCreate: boolean;
    }
  | { kind: 'marking'; start: number; position: number }
  /** The cut is finished and the panel below asks for its shabad. */
  | { kind: 'naming'; title: string; start: number; end: number; note: string }
  | {
      kind: 'segment';
      name: string;
      start: number;
      end: number;
      tone: 'published' | 'scan' | 'draft';
      /** Edges moved and not saved yet. */
      dirty: boolean;
      /** The edges can be moved by this account. */
      editable: boolean;
      /** The one button, or a sentence where there is nothing to press. */
      primary: { label: string; onClick: () => void } | { note: string; tone?: 'done' } | null;
      /** A quiet second action: Unpublish for a reviewer. */
      secondary: { label: string; onClick: () => void } | null;
      /** Neighbours the moved edges now run into, by name — said, not refused. */
      overlaps: string | null;
      /** The other segments under the playhead, one tap from the strip. */
      alsoHere: { id: string; name: string }[];
      /**
       * The same ragi's other tags of this shabad. Said, never refused: a ragi
       * does sing a shabad again. `trackId` set opens that recording in its own
       * tab, keeping the place here to compare against.
       */
      repeats: { id: string; label: string; trackId: string | null }[];
      /** The other recordings could not be checked: not the same as nothing found. */
      repeatsFailed: boolean;
      /** What the scan heard here, for a draft with no shabad. */
      hint: { name: string; onUse: () => void } | null;
      onDelete: (() => void) | null;
      /**
       * The playhead is outside this segment — the strip is holding it after
       * its end was heard — so the next shabad may be starting: offered here
       * too, or it would only be on the `[` key.
       */
      offerNew: boolean;
      /** The row has synced lyrics, which a saved re-cut clears until the next align run. */
      timed: boolean;
    };

/** How many possible duplicates the strip names before counting the rest. */
const REPEATS_SHOWN = 3;

export function SegmentStrip({
  mode,
  busy,
  error,
  onPrev,
  onNext,
  onNudge,
  onHere,
  onHear,
  onSave,
  onUndo,
  onStart,
  onEnd,
  onCancel,
  onTagPointer,
  onAlsoHere,
  onRepeatHere,
}: {
  mode: StripMode;
  busy: boolean;
  error: string | null;
  onPrev: () => void;
  onNext: () => void;
  onNudge: (edge: 'start' | 'end', by: number) => void;
  /** Put this edge of the strip's segment at the playhead. */
  onHere: (edge: 'start' | 'end') => void;
  onHear: (at: number) => void;
  onSave: () => void;
  onUndo: () => void;
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  onTagPointer: () => void;
  onAlsoHere: (id: string) => void;
  /** Jumps and plays, unlike Also here: the point is to hear the two against each other. */
  onRepeatHere: (id: string) => void;
}) {
  if (mode.kind === 'none') return null;

  const steps = (
    <span className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous segment"
        title="Previous segment ( , )"
        onClick={onPrev}
        className="text-muted-foreground"
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next segment"
        title="Next segment ( . )"
        onClick={onNext}
        className="text-muted-foreground"
      >
        <ChevronRight />
      </Button>
    </span>
  );

  let body: ReactNode;
  switch (mode.kind) {
    case 'gap':
      body = (
        <>
          {steps}
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {mode.pointer ? (
              <>
                Scan heard <span className="text-foreground">{mode.pointer.name}</span>
              </>
            ) : (
              <>
                {clock(mode.end - mode.start)} untagged
                <span className="hidden sm:inline">
                  {' '}
                  · {clock(mode.start)}–{clock(mode.end)}
                </span>
              </>
            )}
          </span>
          {!mode.canCreate ? null : mode.pointer ? (
            <Button size="sm" onClick={onTagPointer} disabled={busy}>
              Tag this
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} title="Start a segment at the playhead ( [ )">
              Start here <Kbd>[</Kbd>
            </Button>
          )}
        </>
      );
      break;

    case 'marking':
      body = (
        <>
          <span className="min-w-0 flex-1 truncate pl-1 text-sm font-medium">New shabad</span>
          <Edge
            label="Start"
            at={mode.start}
            onNudge={(by) => onNudge('start', by)}
            onHear={onHear}
          />
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {clock(Math.max(0, mode.position - mode.start))} so far
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
            Cancel
          </Button>
          <Button size="sm" onClick={onEnd} title="End the segment at the playhead ( ] )">
            End here <Kbd>]</Kbd>
          </Button>
        </>
      );
      break;

    case 'naming':
      // The cut is made and the panel below asks for its shabad — Cancel is
      // there, beside the question. Here the edges stay adjustable, since the
      // first listen-back is often the one that hears the cut was early.
      body = (
        <>
          <span className="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{mode.title}</span>
          <span className="flex items-center gap-1">
            <Edge
              label="Start"
              at={mode.start}
              onNudge={(by) => onNudge('start', by)}
              onHear={onHear}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Edge label="End" at={mode.end} onNudge={(by) => onNudge('end', by)} onHear={onHear} />
          </span>
          <span className="text-xs text-muted-foreground sm:min-w-56 sm:text-right">
            {mode.note}
          </span>
        </>
      );
      break;

    case 'segment': {
      const { primary } = mode;
      body = (
        <>
          {steps}
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              mode.tone === 'published'
                ? 'bg-emerald-400'
                : mode.tone === 'scan'
                  ? 'bg-amber-400'
                  : 'bg-muted-foreground'
            )}
          />
          <span className="flex min-w-0 flex-1 basis-28 flex-col">
            {/* Just the name: the lyrics panel below has Change shabad, and a
                name that opened a search when clicked asked "which shabad?"
                of someone only checking which one they were on. */}
            <span className="truncate text-sm font-medium">{mode.name}</span>
            {mode.hint ? (
              <span className="truncate text-xs text-muted-foreground">
                Scan thinks: <span className="text-foreground">{mode.hint.name}</span>
              </span>
            ) : null}
            {mode.alsoHere.length ? (
              <span className="truncate text-xs text-muted-foreground">
                Also here:{' '}
                {mode.alsoHere.map((o, i) => (
                  <Fragment key={o.id}>
                    {i ? ', ' : ''}
                    <button
                      type="button"
                      onClick={() => onAlsoHere(o.id)}
                      title="Switch to this segment ( o )"
                      className="text-foreground underline decoration-border underline-offset-2 hover:decoration-primary"
                    >
                      {o.name}
                    </button>
                  </Fragment>
                ))}
              </span>
            ) : null}
          </span>

          {/* The two edges, each a time you tap to hear and a second either
              way. Fixing an edge is most of the job; a drag on the bar is the
              coarse way, these are the fine one. */}
          <span className="flex items-center gap-1">
            <Edge
              label="Start"
              at={mode.start}
              moved={mode.dirty}
              onNudge={mode.editable ? (by) => onNudge('start', by) : null}
              onHere={mode.editable ? () => onHere('start') : null}
              onHear={onHear}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Edge
              label="End"
              at={mode.end}
              moved={mode.dirty}
              onNudge={mode.editable ? (by) => onNudge('end', by) : null}
              onHere={mode.editable ? () => onHere('end') : null}
              onHear={onHear}
            />
          </span>

          {/* A fixed width, right-aligned: the buttons change with the state —
              Publish, then Undo and Save the moment an edge moves — and a
              cluster that grew and shrank slid the times under the finger
              pressing − and +. */}
          <span className="flex items-center justify-end gap-1 sm:min-w-56">
            {/* With the buttons, not before the name: at the front it
                pushed the name along the moment it appeared. */}
            {mode.offerNew && !mode.dirty ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onStart}
                title="Start a new segment at the playhead ( [ )"
              >
                New here <Kbd>[</Kbd>
              </Button>
            ) : null}
            {mode.dirty ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onUndo}
                  disabled={busy}
                  className="text-muted-foreground"
                >
                  Undo
                </Button>
                <Button size="sm" onClick={onSave} disabled={busy}>
                  Save
                </Button>
              </>
            ) : (
              <>
                {mode.hint ? (
                  <Button size="sm" onClick={mode.hint.onUse} disabled={busy}>
                    Use it
                  </Button>
                ) : null}
                {primary && 'label' in primary ? (
                  <Button
                    size="sm"
                    variant={mode.hint ? 'outline' : 'default'}
                    onClick={primary.onClick}
                    disabled={busy}
                  >
                    {primary.label}
                  </Button>
                ) : primary ? (
                  <span
                    className={cn(
                      'px-2 text-xs',
                      primary.tone === 'done' ? 'text-emerald-400' : 'text-muted-foreground'
                    )}
                  >
                    {primary.note}
                  </span>
                ) : null}
                {mode.secondary ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={mode.secondary.onClick}
                    disabled={busy}
                    className="text-muted-foreground"
                  >
                    {mode.secondary.label}
                  </Button>
                ) : null}
              </>
            )}
            {mode.onDelete && !mode.dirty ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${mode.name}`}
                title="Delete"
                onClick={mode.onDelete}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            ) : null}
          </span>
        </>
      );
      break;
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1',
          mode.kind === 'gap'
            ? 'border border-dashed border-border'
            : mode.kind === 'marking' ||
                mode.kind === 'naming' ||
                (mode.kind === 'segment' && mode.dirty)
              ? 'bg-primary/10'
              : 'bg-card'
        )}
      >
        {body}
      </div>
      {/* Under the row rather than beside the name, where an edit's
          consequences were truncated to nothing in the space the name left. */}
      {mode.kind === 'segment' && mode.dirty ? (
        <>
          {mode.overlaps ? (
            <p className="px-2 text-xs text-muted-foreground">
              Overlaps {mode.overlaps} — fine if you meant it.
            </p>
          ) : null}
          {/* Said before Save, not discovered after: the re-cut trigger
              clears the timings, and "lyrics timed" just vanished. */}
          {mode.timed ? (
            <p className="px-2 text-xs text-muted-foreground">
              Saving clears the synced lyrics until the next align run.
            </p>
          ) : null}
        </>
      ) : null}
      {/* Under the row too: beside the name, the date was the first thing truncated.
          One line and a count, or a much-sung shabad pushed the lyrics down. */}
      {mode.kind === 'segment' && mode.repeats.length ? (
        <p className="truncate px-2 text-xs text-muted-foreground">
          <span className="text-primary">
            <Copy aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
            Possible duplicate:
          </span>{' '}
          {mode.repeats.slice(0, REPEATS_SHOWN).map((o, i) => (
            <Fragment key={o.id}>
              {i ? ', ' : ''}
              {o.trackId ? (
                <Link
                  to="/tag/$id"
                  params={{ id: o.trackId }}
                  search={{ rendition: o.id }}
                  target="_blank"
                  title="Open it in a new tab to compare"
                  className="text-foreground underline decoration-border underline-offset-2 hover:decoration-primary"
                >
                  {o.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => onRepeatHere(o.id)}
                  disabled={mode.dirty}
                  title={mode.dirty ? 'Save or undo the edges first' : 'Play this segment'}
                  className="text-foreground underline decoration-border underline-offset-2 hover:decoration-primary disabled:no-underline disabled:opacity-60"
                >
                  {o.label}
                </button>
              )}
            </Fragment>
          ))}
          {mode.repeats.length > REPEATS_SHOWN
            ? ` and ${mode.repeats.length - REPEATS_SHOWN} more`
            : null}
        </p>
      ) : null}
      {mode.kind === 'segment' && mode.repeatsFailed ? (
        <p className="px-2 text-xs text-muted-foreground">
          Couldn’t check this ragi’s other recordings for duplicates.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One edge: − the time +, with a dot above the time that puts the edge at
 * the playhead — the form's Mark here, for the cut heard while
 * listening rather than found by stepping. Above the time it belongs to, so
 * which edge it moves needs no word; its title says the key and where it
 * would land. The time plays from the cut; each step moves it a second and
 * plays from where it landed, so the next thing heard is whether it now falls
 * in the pause. 44px on a phone, where these are thumbs.
 */
function Edge({
  label,
  at,
  moved = false,
  onNudge,
  onHere,
  onHear,
}: {
  label: string;
  at: number;
  moved?: boolean;
  onNudge: ((by: number) => void) | null;
  onHere?: (() => void) | null;
  onHear: (at: number) => void;
}) {
  const start = label === 'Start';
  const key = start ? '[' : ']';
  /*
   * 44px under the finger; with a mouse 32px tall to match Publish, 28px wide
   * so both edges and the actions fit one line beside the sidebar.
   */
  const step = 'size-11 text-base text-muted-foreground sm:h-8 sm:w-7';
  /*
   * Set to the playhead. It was a dot over the time — the one control that
   * does what the `[` and `]` keys do, and the one nobody found. An icon, not
   * words: with words the strip ran onto a second line; the tooltip and the
   * label say it instead. Each sits on the outside of its group, pointing the
   * way its edge faces, as the handles do on the bar.
   */
  const here = onHere ? (
    <Button
      variant="outline"
      onClick={onHere}
      aria-label={`Move the ${label.toLowerCase()} to the playhead`}
      title={`Move the ${label.toLowerCase()} to the playhead ( ${key} )`}
      className={step}
    >
      {start ? <ArrowLeftToLine /> : <ArrowRightToLine />}
    </Button>
  ) : null;
  /*
   * One group per edge, so which − belongs to which time is read from the
   * border rather than worked out from spacing.
   */
  return (
    <ButtonGroup aria-label={label}>
      {start ? here : null}
      {onNudge ? (
        <Button
          variant="outline"
          aria-label={`${label} a second earlier`}
          title={`${label} a second earlier`}
          onClick={() => onNudge(-1)}
          className={step}
        >
          −
        </Button>
      ) : null}
      <Button
        variant="outline"
        onClick={() => onHear(at)}
        title={`Play from the ${label.toLowerCase()} cut`}
        className={cn(
          'h-11 px-1.5 tabular-nums sm:h-8',
          moved ? 'text-primary' : 'text-foreground'
        )}
      >
        {clock(at)}
      </Button>
      {onNudge ? (
        <Button
          variant="outline"
          aria-label={`${label} a second later`}
          title={`${label} a second later`}
          onClick={() => onNudge(1)}
          className={step}
        >
          +
        </Button>
      ) : null}
      {start ? null : here}
    </ButtonGroup>
  );
}

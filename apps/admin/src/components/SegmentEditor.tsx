/**
 * Create or revise one segment.
 *
 * Boundaries are marked from the playhead rather than typed: a tagger is
 * listening for where a shabad starts, and the honest gesture is "here" — not
 * reading a clock and transcribing it. The numbers stay visible and nudgeable
 * because ears land a second or two early.
 *
 * Always on the page rather than behind a "New segment" button, as the Vue
 * form was: marking a start is the first thing a tagger does, and a form that
 * had to be opened first made it the second.
 */
import {
  canPublishRendition,
  createRendition,
  deleteRendition,
  setRenditionStatus,
  updateRendition,
  useShabadText,
  type BaniDbHit,
  type Draft,
  type Rendition,
  type ShabadVerse,
} from '@kp/api';
import {
  clock,
  overlapping,
  titlesFor,
  type RenditionTitles,
  type TimelineSegment,
  type TitledLine,
} from '@kp/core';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { ShabadSearch } from '@kp/ui/app/shabad-search';
import { useQueryClient } from '@tanstack/react-query';
import { Headphones, Link2, Send, SkipForward, X } from 'lucide-react';
import { useState } from 'react';

import { ShabadDisplay } from '~/components/ShabadDisplay';
import { BANIDB_BASE } from '~/lib/links';
import { supabase } from '~/lib/supabase';
import { MIN_LENGTH } from '~/lib/use-tag-player';

/** The linked shabad, and the line this rendition is known by. */
interface ShabadLink {
  shabadId: number;
  verseId: number | null;
  /**
   * Both titles, read off that line when it was chosen — so a save in the same
   * second as a search pick, or the puratan loop's Publish & next before the
   * shabad's text has loaded, still writes them. A row reopened for editing
   * carries the titles it was saved with instead, until the line itself loads
   * and takes over (see `titles` below).
   */
  titles: RenditionTitles;
}

function linkTo(shabadId: number, verseId: number | null, line: TitledLine): ShabadLink {
  return { shabadId, verseId, titles: titlesFor(line, shabadId) };
}

function linkFromHit(hit: BaniDbHit): ShabadLink {
  return linkTo(hit.shabadId, typeof hit.verseId === 'number' ? hit.verseId : null, hit);
}

/**
 * The puratan loop, offered when a recording is one shabad end to end: publish
 * it, mark it done and open the next one in a single press, or set it aside.
 */
export interface PuratanLoop {
  /** How many untagged puratan recordings wait after this one. */
  left: number | null;
  /** Mark this recording done and open the next. Throws a sentence to show. */
  next: () => Promise<void>;
  /** Open the next without saving anything here. Throws a sentence to show. */
  skip: () => Promise<void>;
}

interface Props {
  trackId: string;
  userId: string;
  segments: TimelineSegment[];
  /** The segment being revised, or null to create a new one. */
  editing: Rendition | null;
  /**
   * The boundaries, owned by the page rather than by this form: the timeline
   * draws them live, and a handle dragged there and a +1s pressed here have to
   * be the same edit. Null until marked.
   */
  start: number | null;
  end: number | null;
  onChangeStart: (seconds: number) => void;
  onChangeEnd: (seconds: number) => void;
  /**
   * Put a boundary at the playhead. Owned by the page rather than done here,
   * because `[` and `]` do exactly the same thing from the keyboard and the
   * rule about the far boundary has to be one rule, not two.
   */
  onMarkStart: () => void;
  onMarkEnd: () => void;
  /** Hear a boundary right after moving it — the only way to check a cut. */
  onAudition: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  /**
   * The whole file is one shabad: boundaries come from the file, so there is
   * nothing to mark. Null when the offer does not apply at all — the recording
   * is already tagged, or a row is open.
   */
  wholeFile: boolean | null;
  onWholeFile: (on: boolean) => void;
  duration: number;
  /**
   * BaniDB's guesses from the filename, best first. The top one is linked
   * until the tagger chooses otherwise; the rest are one click away.
   */
  titleMatches: BaniDbHit[];
  titleMatching: boolean;
  /** A starting name, from a scan pointer. Never a shabad link — see the page. */
  seedName?: string;
  loop: PuratanLoop | null;
  can: { propose: boolean; publish: boolean; remove: boolean; review: boolean };
  onSaved: () => void;
  onCancel: () => void;
}

/** A second or two either way is the usual correction after marking by ear. */
const NUDGE = 1;

export function SegmentEditor({
  trackId,
  userId,
  segments,
  editing,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  onMarkStart,
  onMarkEnd,
  onAudition,
  onSeek,
  wholeFile,
  onWholeFile,
  duration,
  titleMatches,
  titleMatching,
  seedName,
  loop,
  can,
  onSaved,
  onCancel,
}: Props) {
  const queryClient = useQueryClient();

  /*
   * Seeded from `editing` once, at mount.
   *
   * The page gives this component a `key` that changes whenever the target
   * does, so switching rows — or finishing one and starting the next —
   * remounts it and every field below starts fresh. The boundaries are not
   * here: the page owns them and has already seeded them.
   */
  /**
   * The link, three ways. `undefined` is "nobody has chosen": the filename's
   * best match stands in, and follows it if the match arrives late. `null` is
   * "deliberately unlinked". Anything else was picked.
   */
  const [link, setLink] = useState<ShabadLink | null | undefined>(() => {
    if (!editing) return undefined;
    return editing.shabad_id
      ? {
          shabadId: editing.shabad_id,
          verseId: editing.main_verse_id ?? null,
          titles: { name: editing.name, gurmukhi: editing.name_gurmukhi ?? null },
        }
      : null;
  });
  const autoLink = titleMatches[0] ? linkFromHit(titleMatches[0]) : null;
  const linked = link === undefined ? autoLink : link;

  /**
   * The name as typed — read only while no shabad is linked.
   *
   * Linked, the name is the anchor line's and there is no field to type in
   * (#77): a typed name could name a different line than the Gurmukhi beside
   * it, and the player shows either one. Unlinked, a typed name is still all a
   * draft needs — that keeps marking and naming by ear open to anyone.
   * Seeded from a row saved unlinked, or from a scan pointer, which deliberately
   * brings a name and not a link.
   */
  const [typedName, setTypedName] = useState(() =>
    editing ? (editing.shabad_id ? '' : editing.name) : (seedName ?? '')
  );

  const [raag, setRaag] = useState(editing?.raag ?? '');
  const [taal, setTaal] = useState(editing?.taal ?? '');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * The anchor line, once the shabad's text is in.
   *
   * Never a stand-in. This used to fall back to the shabad's first verse for
   * the pill, which is usually a heading ("ਸੂਹੀ ਮਹਲਾ ੫") — harmless as a label,
   * wrong as a title. With no main verse chosen there is no line to name the
   * rendition from, and the form says so instead.
   */
  const text = useShabadText(BANIDB_BASE, linked?.shabadId);
  const verses = text.data?.verses ?? [];
  const anchor =
    linked?.verseId != null ? verses.find((v) => v.verseId === linked.verseId) : undefined;
  /**
   * The rendition's titles: from the line whenever it is to hand, else what
   * the link carries. For a new link those are the same line. For a row
   * reopened for editing, this is how a name saved before #77 — typed, cut
   * short, or ending "Rahau" — comes into line on its next save.
   */
  const titles = linked ? (anchor ? titlesFor(anchor, linked.shabadId) : linked.titles) : null;
  const name = titles ? titles.name : typedName;

  /** A line clicked in the shabad becomes the anchor, and both titles follow it. */
  function pickMainVerse(verse: ShabadVerse) {
    if (!linked) return;
    setLink(linkTo(linked.shabadId, verse.verseId, verse));
  }

  const marked = start !== null && end !== null;
  const ordered = marked && end > start;
  const clashes = marked ? overlapping(segments, { start, end }, editing?.id) : [];
  /**
   * A published rendition keeps its shabad. The database refuses to unlink one
   * in place (renditions_publish_needs_shabad) — it would leave the player a
   * title with nothing behind it — so the form says so before anyone presses.
   */
  const unlinkingPublished = editing?.status === 'published' && !linked;
  const canSave = ordered && name.trim().length > 0 && can.propose && !unlinkingPublished;

  /** Said, not implied by a greyed-out button — the reason it looked like publishing was missing. */
  const waiting = !marked
    ? wholeFile
      ? 'Waiting for the file to say how long it is…'
      : 'Mark both boundaries to save.'
    : !ordered
      ? 'The end must come after the start.'
      : // Before the name: on a published row, typing one would not help.
        unlinkingPublished
        ? 'A published shabad keeps its link. Unpublish it first to unlink it.'
        : !name.trim()
          ? 'A name is all that’s still missing.'
          : null;

  /**
   * Whether this form can end with the shabad in the player: the permission,
   * judged against the link as it stands in the form rather than as saved,
   * since publishing needs one (canPublishRendition).
   */
  const publishable =
    can.publish &&
    Boolean(linked) &&
    (editing
      ? canPublishRendition(
          { ...editing, shabad_id: linked?.shabadId ?? null },
          { review: can.review, publish: can.publish },
          userId
        )
      : true);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['renditions', trackId] });
    void queryClient.invalidateQueries({ queryKey: ['recordings'] });
    void queryClient.invalidateQueries({ queryKey: ['recording', trackId] });
    // Everything this form does changes what is waiting for review.
    void queryClient.invalidateQueries({ queryKey: ['pending'] });
    // Deleting a scan draft also drops the scan's pointers to that shabad.
    void queryClient.invalidateQueries({ queryKey: ['scan-request', trackId] });
  }

  async function run(work: () => Promise<unknown>, done = onSaved) {
    setBusy(true);
    setError(null);
    try {
      await work();
      refresh();
      done();
    } catch (failure) {
      refresh();
      setError(failure instanceof Error ? failure.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  /*
   * No `artist`: the form does not offer it, and leaving it out is what keeps
   * an update from wiping a value set before.
   */
  function draft(): Draft {
    return {
      track_id: trackId,
      name,
      start_sec: Number((start ?? 0).toFixed(2)),
      end_sec: Number((end ?? 0).toFixed(2)),
      raag: raag.trim() || null,
      taal: taal.trim() || null,
      shabad_id: linked?.shabadId ?? null,
      main_verse_id: linked?.verseId ?? null,
      // Explicitly null when unlinked: that is the one save which should clear
      // it, and saying so beats leaving it to the anchor trigger.
      name_gurmukhi: titles ? titles.gurmukhi : null,
    };
  }

  /**
   * Save first, then publish. Creating straight into `published` is refused by
   * RLS unless the account holds `renditions.publish`, and going through the
   * draft leaves the work saved either way if the second step fails.
   */
  async function persist(publish: boolean) {
    const row = editing
      ? await updateRendition(supabase, editing.id, draft())
      : await createRendition(supabase, draft(), userId);
    if (publish && row.status !== 'published') {
      await setRenditionStatus(supabase, row.id, 'published');
    }
  }

  const save = (publish: boolean) => run(() => persist(publish));

  /** The whole puratan loop in one press — publishing when it may, a draft when unlinked. */
  const saveAndNext = () =>
    run(async () => {
      await persist(publishable);
      await loop?.next();
    });

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      await loop?.skip();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open the next one');
    } finally {
      setBusy(false);
    }
  }

  const otherMatches = editing ? [] : titleMatches.filter((m) => m.shabadId !== linked?.shabadId);

  return (
    <div
      className={
        editing
          ? 'flex flex-col gap-4 rounded-xl border border-primary/40 bg-accent/30 p-4'
          : 'flex flex-col gap-4 rounded-xl border border-border p-4'
      }
    >
      {/* The form does double duty, so it says which job it is doing: the
          same fields silently switching from "new" to "revising that one" is
          how somebody overwrites a row they meant to add. */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">
            {editing
              ? `Editing ${editing.name}${editing.status === 'published' ? ' · published' : ''}`
              : wholeFile
                ? 'Confirm this shabad'
                : 'Add a shabad'}
          </h2>
          {wholeFile && !editing ? (
            <p className="mt-1 text-xs text-muted-foreground">
              This recording is one shabad end to end — the boundaries come from the file
              {autoLink && link === undefined ? ' and the shabad from its name' : ''}. Check it’s
              what you hear, then publish.
              {loop?.left != null
                ? loop.left
                  ? ` ${loop.left} more after this one.`
                  : ' This is the last one.'
                : ''}
            </p>
          ) : null}
        </div>
        {editing ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      {wholeFile ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm tabular-nums text-muted-foreground">
            {duration ? `0:00 – ${clock(duration)} · the whole file` : 'Reading the file’s length…'}
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() => onWholeFile(false)}
          >
            Tag part of it instead
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Boundary
              label="Start"
              value={start}
              onMark={onMarkStart}
              // Floor last: `end - MIN_LENGTH` can sit below zero on a segment
              // marked at the very start of a recording.
              onNudge={(by) =>
                start !== null &&
                onChangeStart(
                  Math.max(0, Math.min(start + by, end !== null ? end - MIN_LENGTH : Infinity))
                )
              }
              onSeek={() => start !== null && onSeek(start)}
              onAudition={() => start !== null && onAudition(start)}
            />
            <Boundary
              label="End"
              value={end}
              onMark={onMarkEnd}
              onNudge={(by) =>
                end !== null && onChangeEnd(Math.max((start ?? 0) + MIN_LENGTH, end + by))
              }
              onSeek={() => end !== null && onSeek(end)}
              onAudition={() => end !== null && onAudition(end)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            {ordered ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {clock(end - start)} long
              </span>
            ) : null}
            {/* Any tree can hold a single-shabad file; puratan is just where it
                is the rule. Only offered while nothing is tagged. */}
            {wholeFile === false ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() => onWholeFile(true)}
              >
                The whole file is one shabad
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Shabad</Label>
        {titleMatching && link === undefined ? (
          <p className="text-xs text-muted-foreground">Matching the filename against BaniDB…</p>
        ) : null}
        {linked ? (
          <div className="flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2">
            <Link2 className="size-4 shrink-0 text-primary" />
            {/* The Gurmukhi title exactly as the player will show it — the
                line, less its verse bars, numbers and rahao marker. */}
            <span lang="pa" className="min-w-0 flex-1 truncate font-gurbani text-base">
              {titles?.gurmukhi || (text.isLoading ? '…' : `Shabad ${linked.shabadId}`)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Unlink this shabad"
              onClick={() => setLink(null)}
            >
              <X />
            </Button>
          </div>
        ) : searching ? (
          <ShabadSearch
            base={BANIDB_BASE}
            onSelect={(pick) => {
              // The line they searched for and clicked is the anchor: people
              // recognise a rendition by its rahao, not the first line.
              setLink(
                linkTo(pick.shabadId, pick.verseId, {
                  verse: { unicode: pick.unicode },
                  transliteration: { english: pick.transliteration },
                })
              );
              setSearching(false);
            }}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setSearching(true)}
          >
            <Link2 />
            Link a shabad
          </Button>
        )}
        {/* What the player lists it as in roman. Not an input: with a shabad
            linked the name is the line's, and choosing a different line is
            how it changes. */}
        {linked ? (
          <p className="text-xs text-muted-foreground">
            {linked.verseId == null ? (
              'No main verse chosen yet. Click the line it’s known by below; both titles come from it.'
            ) : (
              <>
                Listed as <span className="text-foreground">{name}</span>. Click another line below
                to change it.
              </>
            )}
          </p>
        ) : null}
        {linked ? (
          <ShabadDisplay
            shabadId={linked.shabadId}
            mainVerseId={linked.verseId}
            onPick={pickMainVerse}
          />
        ) : null}

        {/* The runners-up from the filename match. The pre-selected pick is
            usually right, but "usually" is what the human is here for. */}
        {otherMatches.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              Not this one? The filename also matches:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {otherMatches.map((m) => (
                <Button
                  key={m.verseId}
                  variant="outline"
                  size="sm"
                  className="h-7 max-w-full px-2 text-xs"
                  onClick={() => setLink(linkFromHit(m))}
                >
                  <span lang="pa" className="truncate font-gurbani">
                    {titlesFor(m, m.shabadId).gurmukhi ?? m.transliteration?.english}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {!linked ? (
          <p className="text-xs text-muted-foreground">
            Needed to publish. Its line titles the shabad in English and Gurmukhi, and raag, ang,
            author and the lyrics all follow from it.
          </p>
        ) : null}
      </div>

      {/* Only with nothing linked. A draft still needs no more than a name
          typed by ear, which is what keeps tagging open to anyone; linking
          the shabad replaces it with the line's own titles. */}
      {!linked ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="segment-name">Name</Label>
          <Input
            id="segment-name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !canSave || busy) return;
              // The primary button's action, whichever it is. In the puratan
              // loop a bare publish would leave the recording unmarked — and
              // with no slot, nothing else can ever count it done.
              void (loop ? saveAndNext() : save(publishable));
            }}
            placeholder="Type what you hear, or link a shabad above"
          />
          <p className="text-xs text-muted-foreground">
            Enough for a draft — typing what you hear needs no Gurbani literacy.
          </p>
        </div>
      ) : null}

      {/* Optional by design: neither gates saving, and most taggers skip them.
          Raag shows up in the player's search and rows. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="segment-raag">Raag</Label>
          <Input
            id="segment-raag"
            value={raag}
            onChange={(e) => setRaag(e.target.value)}
            placeholder="Optional, e.g. Asa"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="segment-taal">Taal</Label>
          <Input
            id="segment-taal"
            value={taal}
            onChange={(e) => setTaal(e.target.value)}
            placeholder="Optional, e.g. Teentaal"
          />
        </div>
      </div>

      {/* A warning, not a block: a rendition can legitimately contain another,
          and re-cutting boundaries means transient overlap is normal. */}
      {ordered && clashes.length ? (
        <p className="text-sm text-muted-foreground">
          Overlaps {clashes.map((c) => c.name).join(', ')} — fine if you meant it.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {loop ? (
          <>
            <Button disabled={busy || !canSave} onClick={saveAndNext}>
              <Send />
              {publishable ? 'Publish & next' : 'Save & next'}
            </Button>
            <Button variant="outline" disabled={busy || !canSave} onClick={() => save(false)}>
              Save draft
            </Button>
            {/* Not this one right now. Saves nothing — the recording stays on
                the queue to be picked up later. */}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={skip}
              title="Set this one aside — nothing is saved, and it stays in the queue"
              className="text-muted-foreground"
            >
              <SkipForward />
              Skip for now
            </Button>
          </>
        ) : publishable ? (
          <>
            {/* Publishing is what a publisher is here to do, so it is the
                primary action. It used to be a muted secondary button beside
                a gold Save draft, disabled until a name was typed — which read
                as publishing not being there at all. */}
            <Button disabled={busy || !canSave} onClick={() => save(true)}>
              <Send />
              {editing ? 'Update and publish' : 'Save and publish'}
            </Button>
            <Button variant="outline" disabled={busy || !canSave} onClick={() => save(false)}>
              {editing ? 'Save changes' : 'Save draft'}
            </Button>
          </>
        ) : (
          <Button disabled={busy || !canSave} onClick={() => save(false)}>
            {editing ? 'Save changes' : 'Save draft'}
          </Button>
        )}

        {/* Review, as the policy and the list's own Unpublish require: a role
            with review and no publish lost its only way to pull the open row. */}
        {editing && editing.status === 'published' && can.review ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => setRenditionStatus(supabase, editing.id, 'draft'))}
          >
            Unpublish
          </Button>
        ) : null}

        {editing && can.remove ? (
          <Button
            variant="ghost"
            disabled={busy}
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => {
              // Deleting a tag throws away someone's listening, so it asks.
              if (
                confirm(
                  `Delete “${editing.name}”? This cannot be undone.${editing.source === 'scan' ? " The scanner won't suggest it for this recording again." : ''}`
                )
              ) {
                void run(() => deleteRendition(supabase, editing.id));
              }
            }}
          >
            Delete
          </Button>
        ) : null}

        <span className="text-xs text-muted-foreground" aria-live="polite">
          {!can.propose
            ? 'Your account cannot create segments yet.'
            : (waiting ??
              // Said where Publish would be: a publisher who finds only Save
              // draft should not have to guess why.
              (can.publish && !linked && editing?.status !== 'published'
                ? 'Link a shabad to publish. A draft saves without one.'
                : publishable || loop
                  ? 'Only published shabads appear in the player.'
                  : ''))}
        </span>
      </div>
    </div>
  );
}

function Boundary({
  label,
  value,
  onMark,
  onNudge,
  onSeek,
  onAudition,
}: {
  label: string;
  value: number | null;
  onMark: () => void;
  onNudge: (by: number) => void;
  onSeek: () => void;
  onAudition: () => void;
}) {
  const unset = value === null;
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onMark}>
          Mark here
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={unset}
          aria-label={`${label} back a second`}
          onClick={() => onNudge(-NUDGE)}
        >
          −1s
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={unset}
          aria-label={`${label} forward a second`}
          onClick={() => onNudge(NUDGE)}
        >
          +1s
        </Button>
        {/* Looping a few seconds either side is the only way to tell whether a
            cut actually falls in the gap rather than over a word. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={unset}
          aria-label={`Listen across the ${label.toLowerCase()}`}
          title={`Listen across the ${label.toLowerCase()}`}
          onClick={onAudition}
        >
          <Headphones />
        </Button>
        {unset ? (
          <span className="ml-auto px-2 py-1 text-sm text-muted-foreground/60">—</span>
        ) : (
          <button
            type="button"
            onClick={onSeek}
            title={`Jump to ${clock(value)}`}
            className="ml-auto rounded-md px-2 py-1 text-sm tabular-nums text-muted-foreground hover:text-foreground"
          >
            {clock(value)}
          </button>
        )}
      </div>
    </div>
  );
}

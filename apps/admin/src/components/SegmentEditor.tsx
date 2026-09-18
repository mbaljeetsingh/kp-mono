/**
 * Create or revise one segment.
 *
 * Boundaries are marked from the playhead rather than typed: a tagger is
 * listening for where a shabad starts, and the honest gesture is "here" — not
 * reading a clock and transcribing it. The numbers stay visible and nudgeable
 * because ears land a second or two early.
 */
import {
  createRendition,
  deleteRendition,
  setRenditionStatus,
  updateRendition,
  type Draft,
  type Rendition,
} from '@kp/api';
import { overlapping, prettyShabadName, type TimelineSegment } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { ShabadSearch } from '@kp/ui/app/shabad-search';

import { ShabadDisplay } from '~/components/ShabadDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { Headphones, Link2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { BANIDB_BASE } from '~/lib/links';

import { supabase } from '~/lib/supabase';
import { clock } from '@kp/core';
import { MIN_LENGTH } from '~/lib/use-tag-player';

interface Props {
  trackId: string;
  userId: string;
  /** Where the audio is right now — what "Mark here" means. */
  position: number;
  segments: TimelineSegment[];
  /** The segment being revised, or null to create a new one. */
  editing: Rendition | null;
  /**
   * The boundaries, owned by the page rather than by this form: the timeline
   * draws them live, and a handle dragged there and a +1s pressed here have to
   * be the same edit.
   */
  start: number;
  end: number;
  onChangeStart: (seconds: number) => void;
  onChangeEnd: (seconds: number) => void;
  /** Hear a boundary right after moving it — the only way to check a cut. */
  onAudition: (seconds: number) => void;
  can: { propose: boolean; publish: boolean; remove: boolean; review: boolean };
  onDone: () => void;
  onSeek: (seconds: number) => void;
}

/** A second or two either way is the usual correction after marking by ear. */
const NUDGE = 1;

export function SegmentEditor({
  trackId,
  userId,
  position,
  segments,
  editing,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  onAudition,
  can,
  onDone,
  onSeek,
}: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [raag, setRaag] = useState('');
  const [artist, setArtist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The linked shabad.
   *
   * Optional and additive, but it is the tag worth investing in: once set, raag,
   * ang, author and the lyrics all come from BaniDB for free, and the aligner
   * can give this rendition per-line timings.
   */
  const [shabadId, setShabadId] = useState<number | null>(null);
  const [mainVerseId, setMainVerseId] = useState<number | null>(null);
  const [linkedLine, setLinkedLine] = useState<string>('');
  const [searching, setSearching] = useState(false);

  /*
   * Reload the form whenever the target changes — including to null, which is
   * "start a new one" and must not inherit the last segment's name. The
   * boundaries are not reset here: the page owns them, and it has already
   * seeded them from the playhead or from the row being revised.
   */
  useEffect(() => {
    setError(null);
    setSearching(false);
    setLinkedLine('');
    setName(editing?.name ?? '');
    setRaag(editing?.raag ?? '');
    setArtist(editing?.artist ?? '');
    setShabadId(editing?.shabad_id ?? null);
    setMainVerseId(editing?.main_verse_id ?? null);
  }, [editing]);

  const clashes = overlapping(segments, { start, end }, editing?.id);
  const ordered = end > start;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['renditions', trackId] });
    void queryClient.invalidateQueries({ queryKey: ['recordings'] });
    /*
     * The review queue too. Everything this form does — propose, publish,
     * unpublish, delete — changes what is waiting there, and without this the
     * page that exists to show proposals kept a five-minute-stale count: save a
     * draft, open Review, and the thing you just proposed was not in it.
     */
    void queryClient.invalidateQueries({ queryKey: ['pending'] });
  }

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      refresh();
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  function draft(): Draft {
    return {
      track_id: trackId,
      name,
      start_sec: Number(start.toFixed(2)),
      end_sec: Number(end.toFixed(2)),
      raag: raag.trim() || null,
      artist: artist.trim() || null,
      shabad_id: shabadId,
      main_verse_id: mainVerseId,
    };
  }

  const save = () =>
    run(() =>
      editing
        ? updateRendition(supabase, editing.id, draft())
        : createRendition(supabase, draft(), userId)
    );

  /**
   * Save first, then publish. Creating straight into `published` is refused by
   * RLS unless the account holds `renditions.publish`, and going through the
   * draft leaves the work saved either way if the second step fails.
   */
  const saveAndPublish = () =>
    run(async () => {
      const row = editing
        ? await updateRendition(supabase, editing.id, draft())
        : await createRendition(supabase, draft(), userId);
      await setRenditionStatus(supabase, row.id, 'published');
    });

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{editing ? 'Edit segment' : 'New segment'}</h2>
        {/* Shown for a new segment as well. It used to be gated on `editing`,
            which is null while creating one — so opening the editor by mistake
            left no way to close it but saving something. */}
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Boundary
          label="Start"
          value={start}
          onMark={() => onChangeStart(position)}
          // Clamped against the other end, the same as a drag on the timeline —
          // nudging past it would write a range the database rejects at save.
          onNudge={(by) => onChangeStart(Math.min(Math.max(0, start + by), end - MIN_LENGTH))}
          onSeek={() => onSeek(start)}
          onAudition={() => onAudition(start)}
        />
        <Boundary
          label="End"
          value={end}
          onMark={() => onChangeEnd(position)}
          onNudge={(by) => onChangeEnd(Math.max(start + MIN_LENGTH, end + by))}
          onSeek={() => onSeek(end)}
          onAudition={() => onAudition(end)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Shabad</Label>
        {shabadId ? (
          <div className="flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2">
            <Link2 className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm">
              {linkedLine || `Shabad ${shabadId}`}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Unlink this shabad"
              onClick={() => {
                setShabadId(null);
                setMainVerseId(null);
                setLinkedLine('');
              }}
            >
              <X />
            </Button>
          </div>
        ) : searching ? (
          <ShabadSearch
            base={BANIDB_BASE}
            onSelect={(pick) => {
              setShabadId(pick.shabadId);
              // The line they searched for and clicked is the anchor: people
              // recognise a rendition by its rahao, not by the shabad's first
              // line, and that click is a stronger signal than any heuristic.
              setMainVerseId(pick.verseId);
              setLinkedLine(pick.firstLine);
              // Only fills an empty field — never overwrite a name somebody
              // already typed.
              if (!name.trim() && pick.transliteration) {
                setName(prettyShabadName(pick.transliteration));
              }
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
        {shabadId ? (
          <ShabadDisplay shabadId={shabadId} mainVerseId={mainVerseId} onPick={setMainVerseId} />
        ) : null}

        <p className="text-xs text-muted-foreground">
          Optional, and the tag worth investing in: raag, ang, author and the lyrics all follow from
          it, and the aligner can then time each line.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="segment-name">Name</Label>
        <Input
          id="segment-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What is being sung"
        />
        <p className="text-xs text-muted-foreground">
          The only required tag — typing what you hear needs no Gurbani literacy.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="segment-raag">Raag</Label>
          <Input
            id="segment-raag"
            value={raag}
            onChange={(e) => setRaag(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="segment-artist">Artist override</Label>
          <Input
            id="segment-artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="If a second ragi takes over"
          />
        </div>
      </div>

      {!ordered ? (
        <p role="alert" className="text-sm text-destructive">
          The end must come after the start.
        </p>
      ) : null}

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

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !ordered || !name.trim() || !can.propose} onClick={save}>
          {editing ? 'Save changes' : 'Save draft'}
        </Button>

        {can.publish ? (
          <Button
            variant="secondary"
            disabled={busy || !ordered || !name.trim()}
            onClick={saveAndPublish}
          >
            Save and publish
          </Button>
        ) : null}

        {editing && editing.status === 'published' && can.publish ? (
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
              if (confirm(`Delete “${editing.name}”? This cannot be undone.`)) {
                void run(() => deleteRendition(supabase, editing.id));
              }
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>

      {!can.propose ? (
        <p className="text-xs text-muted-foreground">Your account cannot create segments yet.</p>
      ) : null}
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
  value: number;
  onMark: () => void;
  onNudge: (by: number) => void;
  onSeek: () => void;
  onAudition: () => void;
}) {
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
          aria-label={`${label} back a second`}
          onClick={() => onNudge(-NUDGE)}
        >
          −1s
        </Button>
        <Button
          variant="ghost"
          size="sm"
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
          aria-label={`Listen across the ${label.toLowerCase()}`}
          title={`Listen across the ${label.toLowerCase()}`}
          onClick={onAudition}
        >
          <Headphones />
        </Button>
        <button
          type="button"
          onClick={onSeek}
          title={`Jump to ${clock(value)}`}
          className="ml-auto rounded-md px-2 py-1 text-sm tabular-nums text-muted-foreground hover:text-foreground"
        >
          {clock(value)}
        </button>
      </div>
    </div>
  );
}

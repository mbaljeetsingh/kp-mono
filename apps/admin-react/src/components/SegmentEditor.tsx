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
import { overlapping, type TimelineSegment } from '@kp/core';
import { Button } from '@kp/ui/button';
import { Input } from '@kp/ui/input';
import { Label } from '@kp/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { supabase } from '~/lib/supabase';
import { clock } from '~/lib/utils';

interface Props {
  trackId: string;
  userId: string;
  /** Where the audio is right now — what "Mark here" means. */
  position: number;
  segments: TimelineSegment[];
  /** The segment being revised, or null to create a new one. */
  editing: Rendition | null;
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
  can,
  onDone,
  onSeek,
}: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [raag, setRaag] = useState('');
  const [artist, setArtist] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reload the form whenever the target changes — including to null, which is
  // "start a new one" and must not inherit the last segment's name.
  useEffect(() => {
    setError(null);
    if (editing) {
      setName(editing.name);
      setRaag(editing.raag ?? '');
      setArtist(editing.artist ?? '');
      setStart(Number(editing.start_sec));
      setEnd(Number(editing.end_sec));
      return;
    }
    setName('');
    setRaag('');
    setArtist('');
    setStart(position);
    setEnd(position);
    // `position` is deliberately absent from the deps: re-running on every
    // 100ms tick would drag the boundaries along with playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const clashes = overlapping(segments, { start, end }, editing?.id);
  const ordered = end > start;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['renditions', trackId] });
    void queryClient.invalidateQueries({ queryKey: ['recordings'] });
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
        <h2 className="text-sm font-medium">
          {editing ? 'Edit segment' : 'New segment'}
        </h2>
        {editing ? (
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Boundary
          label="Start"
          value={start}
          onMark={() => setStart(position)}
          onNudge={(by) => setStart((v) => Math.max(0, v + by))}
          onSeek={() => onSeek(start)}
        />
        <Boundary
          label="End"
          value={end}
          onMark={() => setEnd(position)}
          onNudge={(by) => setEnd((v) => Math.max(0, v + by))}
          onSeek={() => onSeek(end)}
        />
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
            onClick={saveAndPublish}>
            Save and publish
          </Button>
        ) : null}

        {editing && editing.status === 'published' && can.publish ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => setRenditionStatus(supabase, editing.id, 'draft'))}>
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
            }}>
            Delete
          </Button>
        ) : null}
      </div>

      {!can.propose ? (
        <p className="text-xs text-muted-foreground">
          Your account cannot create segments yet.
        </p>
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
}: {
  label: string;
  value: number;
  onMark: () => void;
  onNudge: (by: number) => void;
  onSeek: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onMark}>
          Mark here
        </Button>
        <Button variant="ghost" size="sm" aria-label={`${label} back a second`} onClick={() => onNudge(-NUDGE)}>
          −1s
        </Button>
        <Button variant="ghost" size="sm" aria-label={`${label} forward a second`} onClick={() => onNudge(NUDGE)}>
          +1s
        </Button>
        <button
          type="button"
          onClick={onSeek}
          title={`Jump to ${clock(value)}`}
          className="ml-auto rounded-md px-2 py-1 text-sm tabular-nums text-muted-foreground hover:text-foreground">
          {clock(value)}
        </button>
      </div>
    </div>
  );
}

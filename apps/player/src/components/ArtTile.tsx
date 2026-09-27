/**
 * A square of deterministic artwork with initials on it.
 *
 * SGPC publishes bare MP3s — there is no cover art anywhere in the archive —
 * and grey placeholder squares are what makes a music app look broken. The
 * gradient comes from the name, so an artist looks the same on every page.
 */
import { artworkFor, type Playable } from '@kp/core';
import { useState } from 'react';

import { cn } from '~/lib/utils';

interface Props {
  name: string;
  /** What picks the colour, when that should not be the name itself. */
  seed?: string;
  /** A real photo when SGPC published one; the gradient is the fallback. */
  src?: string | null;
  className?: string;
  rounded?: 'md' | 'lg' | 'full';
}

export function ArtTile({ name, seed, src, className, rounded = 'md' }: Props) {
  const art = artworkFor(seed ?? name);
  const initials = seed === undefined ? art.initials : artworkFor(name).initials;

  /**
   * Photos are seeded as paths only — the images themselves are not in git, and
   * are fetched separately — so a 404 is the normal state of a fresh clone. The
   * gradient has to take over silently; a broken-image icon in every third row
   * is worse than no photo at all.
   */
  // Which src failed, rather than a boolean plus an effect to clear it: the
  // effect reset `broken` one render *after* a new src arrived, so a row
  // recycled from a broken photo to a good one showed the gradient for a
  // frame. Deriving it compares against the current src and cannot lag.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const showPhoto = Boolean(src) && brokenSrc !== src;

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-cover bg-center',
        rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-md',
        className
      )}
      style={showPhoto ? undefined : { backgroundImage: art.backgroundImage }}
    >
      {showPhoto ? (
        <img
          src={src!}
          alt=""
          loading="lazy"
          onError={() => setBrokenSrc(src ?? null)}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="select-none text-[0.7em] font-semibold tracking-wide text-white/90"
        >
          {initials}
        </span>
      )}
    </div>
  );
}

/**
 * A shabad's tile: its own initials, coloured by the shabad rather than the
 * ragi. A ragi's tile on every row made one ragi's list a column of identical
 * squares, while the same shabad sung by two ragis looked unrelated; keyed on
 * the BaniDB id it is the other way round.
 */
export function PlayableArt({ item, className }: { item: Playable; className?: string }) {
  return (
    <ArtTile name={item.title} seed={String(item.shabadId ?? item.title)} className={className} />
  );
}

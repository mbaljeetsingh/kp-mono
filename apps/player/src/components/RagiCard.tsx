/** A ragi as a round portrait and a name — the directory, a shelf, search. */
import type { Artist } from '@kp/api';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@kp/ui/carousel';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ArtTile } from '~/components/ArtTile';
import { artistPhotoUrl } from '~/lib/supabase';
import { cn } from '~/lib/utils';

export function RagiCard({ artist, className }: { artist: Artist; className?: string }) {
  const name = artist.display_name ?? artist.name;
  return (
    <Link
      to="/ragis/$name"
      params={{ name: artist.name }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl p-3 text-center hover:bg-accent/50',
        className
      )}
    >
      <ArtTile
        name={name}
        src={artistPhotoUrl(artist.photo_path)}
        rounded="full"
        className="size-20 text-2xl"
      />
      <span className="line-clamp-2 text-sm">{name}</span>
    </Link>
  );
}

/**
 * The Ragis shelf: one swipeable row, with arrows where there is a mouse.
 *
 * A carousel rather than a wrapping grid or a clipped row: a phone swipes it, a
 * mouse steps through it, and nothing is hidden — so keyboard focus never lands
 * on a card nobody can see. The arrows sit in the header rather than at the
 * row's edges, where the page's gutter would cut them off.
 */
export function RagiShelf({ artists, action }: { artists: Artist[]; action?: ReactNode }) {
  return (
    <Carousel opts={{ align: 'start', slidesToScroll: 'auto' }}>
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-medium">Ragis</h2>
          <span className="text-xs text-muted-foreground hover:text-foreground">{action}</span>
          <CarouselPrevious className="static hidden sm:inline-flex" />
          <CarouselNext className="static hidden sm:inline-flex" />
        </div>
        <CarouselContent className="-mx-3 ml-0">
          {artists.map((a) => (
            <CarouselItem key={a.name} className="basis-auto pl-0">
              <RagiCard artist={a} className="w-32" />
            </CarouselItem>
          ))}
        </CarouselContent>
      </section>
    </Carousel>
  );
}

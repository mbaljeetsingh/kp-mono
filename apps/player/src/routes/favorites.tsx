/**
 * Saved shabads.
 *
 * Works signed out: favorites live on the device until there is an account to
 * move them into. The list is fetched by id because that is the only shape
 * both modes share.
 */
import { toPlayable, type Playable } from '@kp/core';
import { Button } from '@kp/ui/button';
import { useQuery } from '@tanstack/react-query';

import { LibraryTabs } from '~/components/LibraryTabs';
import { ShabadList } from '~/components/ShabadList';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function FavoritesRoute() {
  const { favorites, userId, prompt } = useSession();
  const ids = favorites.ids;

  const query = useQuery({
    queryKey: ['favorites', 'rows', ids],
    queryFn: async (): Promise<Playable[]> => {
      if (!ids.length) return [];
      const { data, error } = await supabase.from('shabads').select('*').in('id', ids);
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      // Ordered by the saved list, not by what Postgres returned: the listener
      // put these in an order and an `in.()` filter does not preserve it.
      const byId = new Map(rows.map((r) => [r.id as string, r]));
      return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r) => toPlayable(r as never));
    },
    enabled: ids.length > 0,
  });

  return (
    <section className="flex flex-col gap-4">
      <LibraryTabs />
      <header>
        <h1 className="font-display text-3xl font-semibold">Saved</h1>
        <p className="text-sm text-muted-foreground">
          {userId
            ? 'Saved to your account.'
            : 'Saved on this device — sign in and they follow you.'}
        </p>
      </header>

      {/* A failed read is not an empty list: "Nothing saved yet" over an
          account with saved shabads reads as losing them. */}
      {favorites.failed || (query.isError && query.data === undefined) ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            Could not load your saved shabads.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              favorites.retry();
              void query.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <ShabadList
          items={query.data ?? []}
          loading={query.isLoading}
          empty="Nothing saved yet."
          emptyHint={
            userId
              ? 'Tap the heart on any shabad to keep it here.'
              : 'Tap the heart on any shabad. Sign in to keep them across devices.'
          }
        />
      )}

      {!userId && ids.length > 0 ? (
        <button
          type="button"
          onClick={prompt}
          className="self-start text-sm text-primary hover:underline"
        >
          Sign in to keep these
        </button>
      ) : null}
    </section>
  );
}

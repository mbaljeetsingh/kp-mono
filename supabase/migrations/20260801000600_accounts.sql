-- Optional accounts on the player: favorites and playlists.
--
-- Listening still requires no login. An account adds exactly two things:
-- favorites that outlive one browser's localStorage, and playlists, which
-- device-local storage could technically hold but nobody would trust with a
-- named collection they spent an hour building.
--
-- Both tables key on `renditions(id)` — the same id the `shabads` view exposes
-- and the same id device-local favorites already used, so a guest's saved list
-- migrates into their account as a straight insert.
--
-- A player signup lands in `profiles` as a `contributor`, same as any other
-- account. That grants nothing new: admin's signup has always been open to
-- anyone, and `contributor` may propose renditions but never publish them.

-- ── favorites ─────────────────────────────────────────────────────────────

create table favorites (
  -- References `profiles` rather than `auth.users` directly, matching
  -- `renditions.created_by`. The cascade still reaches: `profiles.id` itself
  -- cascades from `auth.users`.
  user_id      uuid not null references profiles on delete cascade,
  rendition_id uuid not null references renditions on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, rendition_id)
);

-- The only read is "this user's favorites, newest first".
create index favorites_user_idx on favorites (user_id, created_at desc);

-- ── playlists ─────────────────────────────────────────────────────────────

create table playlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  -- Bounded and trimmed in the database, not just in the form: a blank or
  -- whitespace-only name renders as an unclickable gap in the list.
  name       text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index playlists_user_idx on playlists (user_id, created_at desc);

create table playlist_items (
  playlist_id  uuid not null references playlists on delete cascade,
  rendition_id uuid not null references renditions on delete cascade,
  -- Append order, assigned by the trigger below so the client never computes
  -- it. An int rather than a numeric because nothing reorders yet.
  position     int not null default 0,
  added_at     timestamptz not null default now(),
  -- A rendition appears in a playlist once. Adding it again is a no-op, not a
  -- duplicate row the listener then has to delete twice.
  primary key (playlist_id, rendition_id)
);

create index playlist_items_order_idx on playlist_items (playlist_id, position);

-- Append at the end without a read-then-write round trip from the client,
-- which would also race with itself on a double tap. `security definer`
-- because the row-level policy on `playlist_items` would otherwise hide the
-- existing rows from this max().
create function set_playlist_item_position() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position
    from public.playlist_items
    where playlist_id = new.playlist_id;
  end if;
  return new;
end;
$$;

create trigger playlist_items_set_position
  before insert on playlist_items
  for each row execute function set_playlist_item_position();

-- ── row level security ────────────────────────────────────────────────────
-- Everything here is private to its owner. Unlike renditions there is no
-- public read at all: `anon` gets no grant, and no policy admits a non-owner.

alter table favorites      enable row level security;
alter table playlists      enable row level security;
alter table playlist_items enable row level security;

create policy "users read their own favorites"
  on favorites for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users save their own favorites"
  on favorites for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users remove their own favorites"
  on favorites for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "users read their own playlists"
  on playlists for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users create their own playlists"
  on playlists for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users rename their own playlists"
  on playlists for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own playlists"
  on playlists for delete to authenticated
  using (user_id = (select auth.uid()));

-- Playlist items carry no `user_id` — they are owned through their parent, so
-- every policy here is an EXISTS against `playlists`. Note INSERT needs a
-- `with check`: a `using` clause alone is silently ignored on insert, which
-- would leave anyone able to append to anyone's playlist.
create policy "users read items in their own playlists"
  on playlist_items for select to authenticated
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

create policy "users add items to their own playlists"
  on playlist_items for insert to authenticated
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

create policy "users reorder items in their own playlists"
  on playlist_items for update to authenticated
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

create policy "users remove items from their own playlists"
  on playlist_items for delete to authenticated
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_id and p.user_id = (select auth.uid())
    )
  );

-- ── read view ─────────────────────────────────────────────────────────────
-- A playlist's renditions joined to everything a row needs in order to render
-- and play, so opening a playlist is one request rather than two.
--
-- `security_invoker = true` is load-bearing, not decoration. A view runs with
-- its *owner's* privileges by default, which would bypass the policies above
-- and hand every user's playlist contents to every caller. It joins `shabads`
-- rather than `renditions` so it inherits that view's published filter.
--
-- Favorites get no equivalent view: both modes share one id list (localStorage
-- when signed out), so the page reads ids and then `shabads` — a favorites view
-- would return nothing for exactly the guests who need that page most.

create view playlist_shabads with (security_invoker = true) as
select sh.*, i.playlist_id, i.position, i.added_at
from playlist_items i
join shabads sh on sh.id = i.rendition_id;

-- ── grants ────────────────────────────────────────────────────────────────
-- RLS decides which rows; these decide whether the role may touch the table
-- at all. Nothing is granted to `anon`: a signed-out listener's favorites live
-- in their own browser and never reach Postgres.

grant select, insert, delete on favorites to authenticated;
grant all on favorites to service_role;

grant select, insert, update, delete on playlists to authenticated;
grant all on playlists to service_role;

grant select, insert, update, delete on playlist_items to authenticated;
grant all on playlist_items to service_role;

grant select on playlist_shabads to authenticated;

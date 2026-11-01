-- What a signed-in listener played lately, so "Recently played" follows them
-- between devices. A guest's list stays on their device and moves in here when
-- they sign in (@kp/api's useRecentSync).
--
-- One row per rendition per listener: playing it again moves played_at rather
-- than adding a row. So the table is bounded by what someone has ever played, and
-- a write is an upsert, which needs update as well as insert: favorites gets by
-- on insert alone because a second save of the same row has nothing to change.
create table recent_plays (
  user_id      uuid not null references profiles on delete cascade,
  rendition_id uuid not null references renditions on delete cascade,
  played_at    timestamptz not null default now(),
  primary key (user_id, rendition_id)
);

create index recent_plays_latest on recent_plays (user_id, played_at desc);

-- Private to its owner, like favorites: anon gets no grant, and no policy admits
-- anybody else.
revoke all on recent_plays from anon, authenticated;

alter table recent_plays enable row level security;

create policy "users read their own recent plays"
  on recent_plays for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users add their own recent plays"
  on recent_plays for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users update their own recent plays"
  on recent_plays for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on recent_plays to authenticated;
grant all on recent_plays to service_role;

-- A random handful of published shabads, for "play me something".
--
-- The player can already answer "play this shabad" (search), "play this ragi"
-- (the directory) and "play what is new" (the home shelf). It could not answer
-- the state somebody is actually in when they open the app with nothing in
-- mind, which for an archive people listen to ambiently is most of the time —
-- every path in required naming something first.
--
-- In the database because PostgREST cannot express it. `order` takes columns,
-- so there is no `order=random()` to send, and the client-side substitutes are
-- both worse than they look: N single-row requests at random offsets is N round
-- trips, and one contiguous window at a random offset is not a random sample at
-- all — `shabads` comes out in whatever order Postgres finds it, so the same
-- neighbours travel together and a small catalogue shows it immediately.
--
-- `order by random() limit n` is a full scan and a sort of the published set.
-- That is the right trade here and worth writing down so the next person can
-- tell when it stops being true: the scan is over PUBLISHED renditions, which
-- is the tagged sliver of the archive — hundreds today against 49k audio files,
-- and the whole tagging effort exists to grow it. At tens of thousands this is
-- still single-digit milliseconds; if it ever stops being, the replacement is a
-- keyset sample (pick random ids over a covering index) rather than a bigger
-- limit.
--
-- SETOF the view, not a column list: `shabads` is the player's one read surface
-- and every row the client maps goes through the same `toPlayable`. Naming the
-- columns here would mean a second place to remember whenever the view gains
-- one, and the row that came back from a shuffle would quietly differ from the
-- row that came back from a search.
--
-- Deliberately NOT `stable`. A stable function may be evaluated once per query
-- and its result reused, which is exactly wrong for something whose entire job
-- is to answer differently each call. Volatile is the default; it is written
-- out because the two functions either side of it in this schema are stable and
-- the odd one out should say why.
--
-- Security invoker, like everything else that reads `shabads`. The view itself
-- is `security_invoker`, so its `status = 'published'` predicate and the
-- renditions RLS policy behind it both still apply to whoever calls this — a
-- security definer wrapper here would have quietly become a way to read
-- unpublished drafts.
create function random_shabads(n int default 30)
returns setof public.shabads
volatile
set search_path = '' as $$
  select *
  from public.shabads
  order by random()
  -- Clamped rather than trusted: this is called from the browser, and the
  -- difference between `limit 30` and `limit 50000` is the difference between a
  -- queue and a denial of service. 100 is well past what a listening session
  -- consumes before it is reshuffled anyway.
  limit least(greatest(coalesce(n, 30), 1), 100);
$$ language sql;

comment on function random_shabads(int) is
  'A random sample of published shabads, newest-first ordering deliberately '
  'discarded. Powers the player''s shuffle-the-archive control. Volatile on '
  'purpose — a stable function could be evaluated once and reused.';

grant execute on function random_shabads(int) to anon, authenticated;

-- Why `recordings` deliberately does NOT set `security_invoker`.
--
-- Every other view in this schema sets it, and 20260731001200_harden.sql calls
-- it "load-bearing, not decoration". So the omission here reads as an oversight
-- and has already been reported as one. It is not. This migration adds no
-- behaviour — it exists so the next person to notice reaches the right
-- conclusion without re-deriving it, because "fixing" it breaks the workbench
-- silently, in a way no test would catch.
--
-- `recordings` is the tagging queue. Its whole job is the `todo` /
-- `in progress` / `done` split in apps/admin/app/pages/index.vue, which filters
-- on `renditions = 0`, `renditions > 0 and published = 0`, and `published > 0`.
-- Those counts exist to stop two contributors segmenting the same recording.
--
-- The SELECT policy on `renditions` is:
--   status = 'published' or created_by = auth.uid() or authorize('renditions.review')
--
-- Only `reviewer` and `admin` hold `renditions.review`. A `contributor` or
-- `trusted` tagger therefore cannot see anyone else's drafts — correctly, that
-- is the policy's intent for reading rendition *rows*. But run the view as the
-- invoker and those same taggers see `renditions = 0` on a recording somebody
-- else has already drafted, pick it up, and duplicate the work. Measured on the
-- local stack: a track with two of another contributor's drafts reports
-- `{"renditions": 2}` as the view stands and `{"renditions": 0}` with
-- `security_invoker = on`.
--
-- So the aggregate is deliberately privileged where the rows are not. What
-- leaks is the count, and only the count: every other column the view exposes
-- comes from `tracks` and `artists`, both of which are granted to `anon`
-- already. Knowing how much unfinished work sits on a recording is exactly what
-- a tagger needs and is not information worth withholding from one.
--
-- The grant is what bounds this, and it is doing its job: `anon` has no SELECT
-- (a signed-out request gets "permission denied for view recordings"), and the
-- admin app deliberately lets anyone sign up and tag immediately — "the trust
-- ladder gates publishing, not participation" (apps/admin/app/app.vue). Every
-- account that can read this view is a contributor entitled to the queue.
--
-- What WOULD make this wrong, and should be revisited together: giving the
-- admin app a trust gate, so that being signed in stops implying being a
-- tagger; or adding a column to this view drawn from a table that is not
-- already public.

comment on view recordings is
  'Tagging queue. Runs as owner ON PURPOSE: the renditions/published counts '
  'must include other contributors'' unpublished drafts or the todo filter '
  'stops preventing duplicated work. Do not add security_invoker — see '
  '20260802000000_recordings_definer_note.sql. Bounded by the grant: anon has '
  'no SELECT, and every signed-in account is a contributor by design.';

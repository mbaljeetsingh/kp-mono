-- Search by the lines of shabads we hold recordings of.
--
-- Search asked BaniDB which lines match, then asked here which of them have a
-- recording. BaniDB knows nothing of what is here, so `jjs` read 186 shabads and
-- 200 lines (over a second before the first byte, 424 KB for `hjb`) to find the
-- 4 shabads with a recording. Holding those shabads' lines here turns all of it
-- into one query.
--
-- An index, not a copy of Gurbani. BaniDB stays the source: the read-along reads
-- it live, so a correction shows there at once, and only what search needs is
-- kept here. packages/aligner/fill_lines.py writes the rows; --refresh brings
-- corrections in.
--
-- No index on the text. It is a few lines per shabad, and all of Guru Granth Sahib
-- is about 60,000. The scan is measured in the PR; a trigram index is the fix if
-- that ever stops being true.

create table shabad_lines (
  verse_id int primary key,
  shabad_id int not null,
  gurmukhi text not null,
  gurmukhi_keys text not null,
  roman text not null,
  letters_pa text not null,
  letters_en text not null
);

comment on table shabad_lines is
  'BaniDB lines of shabads with a rendition, for search only. Written by '
  'packages/aligner/fill_lines.py; the read-along does not read it.';
comment on column shabad_lines.gurmukhi_keys is
  'The line in GurbaniLipi keys, which is what a physical keyboard types.';
comment on column shabad_lines.letters_pa is
  'First letter of each word, on the vowel carriers BaniDB indexes by.';

create index shabad_lines_shabad_idx on shabad_lines (shabad_id);

alter table shabad_lines enable row level security;
create policy "anyone can read lines" on shabad_lines for select using (true);

revoke all on shabad_lines from anon, authenticated;
grant select on shabad_lines to anon, authenticated;
grant all on shabad_lines to service_role;

-- A page of recordings for a search, each with the line that found it, if one did.
--
-- `letters` is empty when the term is too short or has spaces, as core decides.
-- Recordings of shabads with a line opening on the letters come first, the rest
-- by plays; a shabad's best line is the one shown over it. Security invoker like
-- `random_shabads`, so the view's published filter still applies, and returning the
-- view's row means every result goes through the same `toPlayable`.
create function search_shabads(
  letters text,
  words text,
  script text,
  page_from int default 0,
  page_size int default 50
)
returns table (
  shabad public.shabads,
  verse_id int,
  gurmukhi text,
  gurmukhi_keys text,
  roman text
)
stable
set search_path = '' as $$
  with wanted as (
    select
      regexp_replace(letters, '([\\%_])', '\\\1', 'g') as initials,
      '%' || regexp_replace(words, '([\\%_])', '\\\1', 'g') || '%' as pattern
  ),
  lines as (
    select
      l.*,
      case when script = 'pa' then l.letters_pa else l.letters_en end as initials
    from public.shabad_lines l
  ),
  matched as (
    select
      l.*,
      w.initials <> '' and l.initials like w.initials || '%' as opens
    from lines l, wanted w
    where (w.initials <> '' and l.initials like '%' || w.initials || '%')
      or (
        -- Three letters are initials: as text, `sat` is every line with satigur in it.
        length(words) >= 4
        and case
          when script = 'pa' then l.gurmukhi like w.pattern or l.gurmukhi_keys like w.pattern
          else l.roman ilike w.pattern
        end
      )
  ),
  best as (
    select distinct on (m.shabad_id) m.*
    from matched m
    order by m.shabad_id, m.opens desc, m.verse_id
  )
  select s, b.verse_id, b.gurmukhi, b.gurmukhi_keys, b.roman
  from public.shabads s
  left join best b on b.shabad_id = s.shabad_id
  cross join wanted w
  where b.shabad_id is not null
    or case
      when script = 'pa' then s.name_gurmukhi ilike w.pattern
      else s.name ilike w.pattern or s.artist_display ilike w.pattern
    end
  order by coalesce(b.opens, false) desc, s.play_count desc, s.id
  -- Clamped rather than trusted, as `random_shabads` does: this is called from
  -- the browser.
  limit least(greatest(page_size, 1), 100)
  offset greatest(page_from, 0);
$$ language sql;

revoke all on function search_shabads(text, text, text, int, int) from public, anon, authenticated;
grant execute on function search_shabads(text, text, text, int, int) to anon, authenticated;

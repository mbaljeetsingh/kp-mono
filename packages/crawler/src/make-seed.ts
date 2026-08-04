/**
 * Generate supabase/seed.sql from a real, crawled local database (issue #27).
 *
 * A fresh clone used to need an ~8 minute crawl before anything rendered,
 * which also made `supabase db reset` expensive enough that people avoided
 * it. The committed seed removes that wait: reset applies migrations, then
 * this file, and the player has real shabads, real ragis and a real tagging
 * queue with no network access.
 *
 * A SAMPLE, not the whole catalogue (49k rows is ~12 MB of SQL; the sample is
 * ~500 rows). The sample deliberately spans ragiwise, puratan AND daywise —
 * the three trees parse differently, and a seed that only covers one hides
 * bugs in the others. Every track referenced by a rendition or a scan request
 * is always included, whatever the caps, so nothing dangles.
 *
 * Also seeds two accounts so the permission split is testable immediately:
 *
 *   admin@kirtan.com        / password123   (trust: admin)
 *   contributor@kirtan.com  / password123   (trust: contributor)
 *
 * Rendition/scan authorship is remapped onto the seeded admin, so no real
 * account id or email ever lands in git. Artist photo_paths are seeded but
 * the images are not (7 MB of PNGs do not belong in git) — the player's
 * gradient fallback covers the gap, and `pnpm seed:artists` fetches the real
 * ones on demand, same as after any reset.
 *
 * Regenerate whenever the schema moves or the sample should refresh — run it
 * against a database that holds a full crawl:
 *
 *   pnpm seed:generate            # local stack on the default ports
 *   SEED_DB_URL=postgresql://... pnpm seed:generate
 *
 * Deterministic on purpose (fixed ids, fixed timestamp, precomputed password
 * hash, stable ordering): regenerating against unchanged data produces an
 * unchanged file, so a seed diff always means the data or schema moved.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/seed.sql'
);

const DB_URL =
  process.env.SEED_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Bypasses the "is this a full crawl" guard below. */
const FORCE = process.argv.includes('--force');

// How the sample is drawn, per tree. Ragiwise is one track per ragi (~204
// ragis); puratan is a handful per ragi (~26 ragis); daywise has no artist
// directories, so it is simply the newest N. "Newest first" within each
// partition, because recent files are the ones whose parsing matters most.
const RAGIWISE_PER_ARTIST = 1;
const PURATAN_PER_ARTIST = 5;
const DAYWISE_NEWEST = 100;

// Fixed identities so regeneration never churns the file. The bcrypt hash is
// crypt('password123', gen_salt('bf')) computed once — embedding the call
// instead would salt differently on every run.
const FIXED_TS = '2026-08-04T00:00:00+00:00';
const PASSWORD_HASH =
  '$2a$06$RhBKRIjE7xhXdUE2EeUsouo.KCenpgSr/ORPTcMS8w8XGYW1tk45m';
const ACCOUNTS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    identityId: '00000000-0000-4000-8000-000000000101',
    email: 'admin@kirtan.com',
    displayName: 'Seed Admin',
    trust: 'admin',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    identityId: '00000000-0000-4000-8000-000000000102',
    email: 'contributor@kirtan.com',
    displayName: 'Seed Contributor',
    trust: 'contributor',
  },
] as const;
const ADMIN_ID = ACCOUNTS[0].id;

// `date` columns come back as strings, not local-midnight Date objects that
// would shift a day depending on the generating machine's timezone.
pg.types.setTypeParser(1082, (v: string) => v);

function sqlLit(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) {
    return v.length ? `array[${v.map(sqlLit).join(', ')}]` : `'{}'`;
  }
  if (typeof v === 'object') {
    return `${sqlLit(JSON.stringify(v))}::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Multi-row INSERT, chunked so no single statement grows absurd.
 *
 * `jsonbCols` matters: a jsonb column holding a top-level JSON array (like
 * line_timings) comes back from pg as a JS array, which the generic encoder
 * would emit as a SQL array[...] — a jsonb[] — and the insert would fail.
 */
function insertBlock(
  table: string,
  rows: Record<string, unknown>[],
  jsonbCols: Set<string> = new Set()
): string {
  if (rows.length === 0) return `-- ${table}: nothing to seed\n`;
  const columns = Object.keys(rows[0]);
  const lit = (c: string, v: unknown) =>
    jsonbCols.has(c) && v !== null && v !== undefined
      ? `${sqlLit(JSON.stringify(v))}::jsonb`
      : sqlLit(v);
  const chunks: string[] = [];
  for (let i = 0; i < rows.length; i += 50) {
    const values = rows
      .slice(i, i + 50)
      .map((r) => `  (${columns.map((c) => lit(c, r[c])).join(', ')})`)
      .join(',\n');
    chunks.push(
      `insert into ${table} (${columns.join(', ')}) values\n${values};`
    );
  }
  return chunks.join('\n\n') + '\n';
}

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const JSONB_OID = 3802;
async function fetchTable(sql: string, params: unknown[] = []) {
  const res = await client.query(sql, params);
  return {
    rows: res.rows as Record<string, unknown>[],
    jsonbCols: new Set(
      res.fields.filter((f) => f.dataTypeID === JSONB_OID).map((f) => f.name)
    ),
  };
}

// A seed generated from a near-empty database would silently replace a good
// sample with a useless one — same spirit as the guards in seed.ts.
const {
  rows: [{ count: trackCount }],
} = await client.query('select count(*)::int as count from tracks');
if (trackCount < 10_000 && !FORCE) {
  console.error(
    `tracks has only ${trackCount} rows — this does not look like a full crawl.\n` +
      'Seed the database first (pnpm crawl && pnpm seed), or pass --force.'
  );
  process.exit(1);
}

const { rows: tracks, jsonbCols: tracksJsonb } = await fetchTable(
  `
  with keep as (
    select track_id from renditions
    union
    select track_id from scan_requests
  ),
  ranked as (
    select t.*,
           row_number() over (
             partition by t.tree, t.artist_dir
             order by t.date desc nulls last, t.id
           ) as rn
    from tracks t
    where t.missing_since is null
  )
  select * from ranked
  where id in (select track_id from keep)
     or (tree = 'ragiwise' and rn <= $1)
     or (tree = 'puratan'  and rn <= $2)
     or (tree = 'daywise'  and rn <= $3)
  order by tree, id
  `,
  [RAGIWISE_PER_ARTIST, PURATAN_PER_ARTIST, DAYWISE_NEWEST]
);
for (const t of tracks) delete t.rn;

const { rows: artists, jsonbCols: artistsJsonb } = await fetchTable(
  'select * from artists order by name'
);

// Authorship is remapped onto the seeded admin — see the header.
const { rows: renditions, jsonbCols: renditionsJsonb } = await fetchTable(
  'select * from renditions order by id'
);
for (const r of renditions) if (r.created_by) r.created_by = ADMIN_ID;

const { rows: scans, jsonbCols: scansJsonb } = await fetchTable(
  'select * from scan_requests order by track_id'
);
for (const s of scans) if (s.requested_by) s.requested_by = ADMIN_ID;

await client.end();

const published = renditions.filter((r) => r.status === 'published').length;
const byTree = tracks.reduce<Record<string, number>>((acc, t) => {
  acc[t.tree] = (acc[t.tree] ?? 0) + 1;
  return acc;
}, {});

const accounts = ACCOUNTS.map(
  (a) => `
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '${a.id}',
  'authenticated', 'authenticated', '${a.email}', '${PASSWORD_HASH}',
  '${FIXED_TS}', '{"provider":"email","providers":["email"]}',
  '{"display_name":"${a.displayName}"}', '${FIXED_TS}', '${FIXED_TS}', '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  '${a.identityId}', '${a.id}',
  '{"sub":"${a.id}","email":"${a.email}","email_verified":true}',
  'email', '${a.id}', '${FIXED_TS}', '${FIXED_TS}', '${FIXED_TS}'
);

-- The on_auth_user_created trigger has already made the profile row; this
-- pins trust (and survives being applied with triggers disabled).
insert into public.profiles (id, display_name, trust)
values ('${a.id}', '${a.displayName}', '${a.trust}')
on conflict (id) do update set display_name = excluded.display_name, trust = excluded.trust;
`
).join('');

const header = `-- Generated by packages/crawler/src/make-seed.ts — do not edit by hand.
-- Regenerate (against a database holding a full crawl): pnpm seed:generate
--
-- Applied automatically after migrations by \`supabase db reset\`.
-- Contents: ${tracks.length} tracks (${Object.entries(byTree)
  .map(([k, v]) => `${v} ${k}`)
  .join(', ')}), ${artists.length} artists, ${renditions.length} renditions
-- (${published} published), ${scans.length} scan requests, 2 accounts:
--   admin@kirtan.com / password123        (trust: admin)
--   contributor@kirtan.com / password123  (trust: contributor)
--
-- Artist photos are NOT seeded (only their photo_path values) — the player
-- falls back to gradients; run \`pnpm seed:artists\` to fetch the images.
`;

const sql = [
  header,
  '-- ── accounts ─────────────────────────────────────────────────────────────',
  accounts,
  '-- ── artists ──────────────────────────────────────────────────────────────',
  insertBlock('public.artists', artists, artistsJsonb),
  '-- ── tracks ───────────────────────────────────────────────────────────────',
  insertBlock('public.tracks', tracks, tracksJsonb),
  '-- ── renditions ───────────────────────────────────────────────────────────',
  insertBlock('public.renditions', renditions, renditionsJsonb),
  '-- ── scan queue ───────────────────────────────────────────────────────────',
  insertBlock('public.scan_requests', scans, scansJsonb),
].join('\n');

await writeFile(OUT, sql);
console.log(
  `wrote ${OUT}: ${tracks.length} tracks, ${artists.length} artists, ` +
    `${renditions.length} renditions (${published} published), ${scans.length} scan requests`
);

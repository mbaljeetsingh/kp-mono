/**
 * sgpc.net serves TWO different directory listings from the same host, and a
 * single parser silently misses one of them:
 *
 *   "themed"   — /ragiwise/, /puratanlkirtan/, /kirtan/ (root)
 *                Bootstrap-styled lister. Children are `?dir=<Name>` query
 *                links; files are relative hrefs. Every entry appears TWICE
 *                (icon link + text link), so dedup is mandatory, not incidental.
 *
 *   "autoindex"— /kirtan/<year>/ and below
 *                Stock Apache. Children are `Name/` hrefs; files are plain
 *                hrefs. Carries size and mtime columns worth harvesting so we
 *                never need 45k HEAD requests.
 *
 * Both are wrapped in a Cloudflare beacon anchor and Apache's `?C=N;O=D` sort
 * links; both must be filtered or the crawler walks in circles.
 */

export type ListingKind = 'themed' | 'autoindex';

export interface ListingEntry {
  /** Directory name (themed: `?dir=` value; autoindex: trailing-slash href). */
  dirName?: string;
  /** File href, relative to the listing URL. */
  fileHref?: string;
  sizeBytes?: number | null;
  modifiedAt?: string | null;
}

export interface Listing {
  kind: ListingKind;
  dirs: string[];
  files: {
    href: string;
    sizeBytes: number | null;
    modifiedAt: string | null;
  }[];
}

const AUDIO = /\.(mp3|wma|m4a|aac|ogg|wav)$/i;

/** Apache's "563M" / "1.2G" / "930K" / "-" size column. */
export function parseApacheSize(raw: string): number | null {
  const m = raw.trim().match(/^([\d.]+)\s*([KMGT])?$/i);
  if (!m) return null;
  const mult = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[
    (m[2] || '').toUpperCase() as 'K' | 'M' | 'G' | 'T'
  ];
  return Math.round(Number(m[1]) * (mult ?? 1));
}

function isNoise(href: string): boolean {
  return (
    href.startsWith('?C=') || // Apache column-sort links
    href.includes('cdn-cgi') || // Cloudflare beacon anchor
    href.startsWith('javascript:') ||
    href.startsWith('#') ||
    href.startsWith('//') || // CDN css/fonts
    href.startsWith('http') // absolute — never a child here
  );
}

/**
 * Detect by container id, not by `?dir=` links: a leaf artist page is still a
 * themed listing but has no child directories, so keying on `?dir=` misfires
 * on exactly the pages that hold all the audio. `#directory-listing` is
 * present on both the index and the leaf pages (and is the same hook the
 * original 2019 scraper used, so it has outlived one redesign already).
 */
export function detectKind(html: string): ListingKind | null {
  if (/id="directory-listing"/i.test(html)) return 'themed';
  if (/<title>\s*Index of /i.test(html)) return 'autoindex';
  return null;
}

/**
 * Autoindex rows look like:
 *   <td><a href="01/">01/</a></td><td align="right">2025-01-02 15:27  </td>
 *   <td align="right">563M</td>
 * Parsed row-wise so size/mtime stay attached to the right href.
 */
function parseAutoindex(html: string): Listing {
  const dirs: string[] = [];
  const files: Listing['files'] = [];

  for (const row of html.split(/<tr[^>]*>/i).slice(1)) {
    const hrefMatch = row.match(/<a\s+href="([^"]+)"/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (isNoise(href) || href === '/' || href.startsWith('/')) continue;

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
    );
    const modifiedAt =
      cells.find((c) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c)) ?? null;
    const sizeCell = cells.find((c) => /^[\d.]+[KMGT]?$/i.test(c) && c !== '-');

    if (href.endsWith('/')) {
      dirs.push(decodeURIComponent(href.slice(0, -1)));
    } else if (AUDIO.test(href)) {
      files.push({
        href,
        sizeBytes: sizeCell ? parseApacheSize(sizeCell) : null,
        modifiedAt,
      });
    }
  }
  return { kind: 'autoindex', dirs, files };
}

/**
 * Themed lister. Entries are duplicated (icon anchor + text anchor), so both
 * sets are deduped — the earlier probe of one ragi directory returned 380
 * hrefs for 190 real files.
 */
function parseThemed(html: string): Listing {
  const dirs = new Set<string>();
  const files = new Map<
    string,
    { href: string; sizeBytes: null; modifiedAt: null }
  >();

  for (const m of html.matchAll(/<a\s+[^>]*href="([^"]+)"/gi)) {
    const href = m[1];
    if (isNoise(href)) continue;

    const dirMatch = href.match(/^\?dir=(.+)$/);
    if (dirMatch) {
      dirs.add(decodeURIComponent(dirMatch[1].replace(/\+/g, ' ')));
      continue;
    }
    if (AUDIO.test(href)) {
      files.set(href, { href, sizeBytes: null, modifiedAt: null });
    }
  }
  return { kind: 'themed', dirs: [...dirs], files: [...files.values()] };
}

/**
 * Throws on unrecognised markup rather than returning empty — an empty result
 * is indistinguishable from "SGPC redesigned again", and this crawler has
 * already outlived one redesign that silently 404'd for months.
 */
export function parseListing(html: string, url: string): Listing {
  const kind = detectKind(html);
  if (!kind) {
    throw new Error(
      `Unrecognised listing markup at ${url} — neither ?dir= nor "Index of". ` +
        `SGPC may have changed the site again.`
    );
  }
  return kind === 'autoindex' ? parseAutoindex(html) : parseThemed(html);
}

/**
 * The two doors out of the player, named once.
 *
 * The player deliberately carries no editing UI: the archive grows in the
 * tagging workbench and the code grows on GitHub, so this is where the app
 * says so. A file rather than inline hrefs so a domain change is one line.
 *
 * `contribute.`, not `admin.`: the workbench is the public door for tagging,
 * and "admin" told visitors it wasn't for them — the opposite of the trust
 * model, where every signed-in account may tag.
 */
export const GITHUB_URL = 'https://github.com/mbaljeetsingh/kp-mono';
export const CONTRIBUTE_URL = 'https://contribute.kirtanplayer.beejaysoft.com/';

/**
 * BaniDB, through the dev proxy.
 *
 * Same-origin in dev as well as production: BaniDB caches its allow-origin
 * header across ports, so a direct call from :3000 gets a response cached for
 * another origin and is blocked. See the proxy in vite.config.ts.
 */
export const BANIDB_BASE = '/banidb';

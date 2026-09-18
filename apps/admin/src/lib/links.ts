/**
 * BaniDB, through the dev proxy.
 *
 * Same-origin: BaniDB caches its allow-origin header across ports, so a direct
 * call from :3001 gets a response cached for another origin and is blocked.
 * See the proxy in vite.config.ts.
 */
export const BANIDB_BASE = '/banidb';
